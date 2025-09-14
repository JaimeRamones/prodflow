// Ruta: supabase/functions/mercadolibre-bulk-update-safety-stock-immediate/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const startTime = Date.now()

    try {
        // Obtener datos del request
        const { filters, safetyStock } = await req.json()
        
        if (safetyStock === undefined || safetyStock === null) {
            throw new Error('safetyStock es requerido')
        }

        // Inicializar Supabase
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Obtener usuario autenticado
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Authorization header requerido')
        }

        const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
            global: { headers: { Authorization: authHeader } }
        })

        const { data: { user } } = await supabaseClient.auth.getUser()
        if (!user) {
            throw new Error('Usuario no autenticado')
        }

        console.log(`Actualizando stock de seguridad masivo para usuario: ${user.id}`)
        console.log(`Filtros recibidos:`, filters)
        console.log(`Stock de seguridad: ${safetyStock}`)

        // Construir query basado en filtros
        let query = supabase
            .from('mercadolibre_listings')
            .select('id, meli_id, meli_variation_id, sku, available_quantity, status')
            .eq('user_id', user.id)

        // Aplicar filtros si existen
        if (filters?.searchTerm?.trim()) {
            query = query.or(`title.ilike.%${filters.searchTerm.trim()}%,sku.ilike.%${filters.searchTerm.trim()}%`)
        }
        if (filters?.statusFilter) {
            query = query.eq('status', filters.statusFilter)
        }
        if (filters?.typeFilter) {
            query = query.eq('listing_type_id', filters.typeFilter)
        }
        if (filters?.syncFilter !== '' && filters?.syncFilter !== undefined) {
            query = query.eq('sync_enabled', filters.syncFilter === 'true')
        }

        // Obtener todas las publicaciones que coinciden con los filtros
        const { data: publications, error: fetchError } = await query

        if (fetchError) {
            throw new Error(`Error obteniendo publicaciones: ${fetchError.message}`)
        }

        if (!publications || publications.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                count: 0,
                message: 'No se encontraron publicaciones que coincidan con los filtros',
                duration: `${(Date.now() - startTime) / 1000}s`
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log(`Encontradas ${publications.length} publicaciones para actualizar`)

        // Actualizar stock de seguridad en lotes
        const BATCH_SIZE = 5000
        let updatedCount = 0
        let syncedCount = 0

        for (let i = 0; i < publications.length; i += BATCH_SIZE) {
            const batch = publications.slice(i, i + BATCH_SIZE)
            
            try {
                // Actualizar stock de seguridad en la base de datos
                const { error: updateError } = await supabase
                    .from('mercadolibre_listings')
                    .update({ safety_stock: safetyStock })
                    .in('id', batch.map(p => p.id))

                if (updateError) {
                    console.error(`Error actualizando lote ${i}:`, updateError.message)
                    continue
                }

                updatedCount += batch.length
                console.log(`Actualizado lote ${i + 1}-${Math.min(i + BATCH_SIZE, publications.length)} (${updatedCount}/${publications.length})`)

                // Procesar cada publicación para sincronización inmediata con MercadoLibre
                for (const pub of batch) {
                    try {
                        // Obtener stock físico del sync_cache
                        const { data: syncData } = await supabase
                            .from('sync_cache')
                            .select('calculated_stock')
                            .eq('sku', pub.sku)
                            .single()

                        if (syncData) {
                            // Calcular nuevo stock disponible
                            let newAvailableStock = Math.max(0, syncData.calculated_stock - safetyStock)
                            
                            // Aplicar división para kits
                            if (pub.sku && pub.sku.includes('/X')) {
                                const multiplierMatch = pub.sku.match(/\/X(\d+)/)
                                if (multiplierMatch) {
                                    const multiplier = parseInt(multiplierMatch[1])
                                    newAvailableStock = Math.floor(newAvailableStock / multiplier)
                                }
                            }
                            
                            // Determinar nuevo estado
                            const shouldBeActive = newAvailableStock > 0
                            const currentlyActive = pub.status === 'active'
                            let newStatus = pub.status
                            
                            if (shouldBeActive !== currentlyActive) {
                                newStatus = shouldBeActive ? 'active' : 'paused'
                            }
                            
                            // Sincronizar con MercadoLibre
                            const syncPayload = {
                                meliId: pub.meli_id,
                                variationId: pub.meli_variation_id,
                                availableQuantity: newAvailableStock,
                                sku: pub.sku
                            }
                            
                            if (newStatus !== pub.status) {
                                syncPayload.status = newStatus
                            }
                            
                            const { error: syncError } = await supabase.functions.invoke('mercadolibre-update-single-item', {
                                body: syncPayload
                            })
                            
                            if (!syncError) {
                                syncedCount++
                                
                                // Actualizar el estado en la BD también
                                await supabase
                                    .from('mercadolibre_listings')
                                    .update({ 
                                        available_quantity: newAvailableStock,
                                        status: newStatus 
                                    })
                                    .eq('id', pub.id)
                            } else {
                                console.error(`Error sincronizando ${pub.meli_id}:`, syncError.message)
                            }
                        }
                    } catch (error) {
                        console.error(`Error procesando publicación ${pub.meli_id}:`, error.message)
                    }
                    
                    // Rate limiting para evitar saturar ML
                    await new Promise(resolve => setTimeout(resolve, 50))
                }

            } catch (error) {
                console.error(`Error en lote ${i}:`, error.message)
            }
        }

        const duration = (Date.now() - startTime) / 1000
        const message = `Stock de seguridad actualizado para ${updatedCount} publicaciones. ${syncedCount} sincronizadas con MercadoLibre.`

        console.log(`Completado: ${message} en ${duration}s`)

        return new Response(JSON.stringify({
            success: true,
            count: updatedCount,
            synced: syncedCount,
            message: message,
            duration: `${duration}s`
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('Error en bulk update:', error.message)
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            duration: `${(Date.now() - startTime) / 1000}s`
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})