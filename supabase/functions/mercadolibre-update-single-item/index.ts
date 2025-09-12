// Ruta: supabase/functions/mercadolibre-update-single-item/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
    // Manejar preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Inicializar cliente de Supabase
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        // Obtener datos del request
        const { meliId, variationId, availableQuantity, sku, price, status } = await req.json()

        console.log('Actualizando item:', { meliId, variationId, availableQuantity, sku, price, status })

        // Obtener configuración de MercadoLibre
        const { data: config } = await supabase
            .from('configuracion')
            .select('access_token, refresh_token')
            .eq('plataforma', 'mercadolibre')
            .single()

        if (!config?.access_token) {
            throw new Error('No se encontró access_token de MercadoLibre')
        }

        // Construir el payload de actualización
        const payload: any = {}
        
        if (availableQuantity !== undefined) {
            const stockValue = Math.max(0, Math.floor(availableQuantity))
            payload.available_quantity = stockValue
            
            // Lógica de activar/pausar automáticamente según stock
            if (status === undefined) { // Solo si no se especificó un estado manualmente
                payload.status = stockValue > 0 ? 'active' : 'paused'
            }
        }
        
        if (price !== undefined) {
            payload.price = parseFloat(price.toString())
        }
        
        if (status !== undefined) {
            payload.status = status
        }

        // Si hay variation_id, actualizar la variación
        if (variationId) {
            payload.variations = [{
                id: variationId,
                available_quantity: payload.available_quantity,
                price: payload.price
            }]
            // Remover campos del nivel principal para variaciones
            delete payload.available_quantity
            delete payload.price
        }

        console.log('Payload a enviar a ML:', JSON.stringify(payload, null, 2))

        // Actualizar en MercadoLibre
        const mlResponse = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        })

        if (!mlResponse.ok) {
            const errorText = await mlResponse.text()
            console.error('Error de MercadoLibre:', errorText)
            
            // Si el token expiró, intentar renovarlo
            if (mlResponse.status === 401) {
                console.log('Access token expirado, intentando renovar...')
                const refreshResult = await refreshAccessToken(supabase, config.refresh_token)
                
                if (refreshResult.success) {
                    // Reintentar con el nuevo token
                    const retryResponse = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${refreshResult.accessToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload)
                    })
                    
                    if (!retryResponse.ok) {
                        const retryError = await retryResponse.text()
                        throw new Error(`Error en reintento ML: ${retryError}`)
                    }
                } else {
                    throw new Error('No se pudo renovar el access token')
                }
            } else {
                throw new Error(`Error ML ${mlResponse.status}: ${errorText}`)
            }
        }

        // Actualizar base de datos local
        const updateData: any = {}
        
        if (availableQuantity !== undefined) {
            updateData.available_quantity = Math.max(0, Math.floor(availableQuantity))
        }
        
        if (status !== undefined) {
            updateData.status = status
        }
        
        if (price !== undefined) {
            updateData.price = parseFloat(price.toString())
        }

        if (Object.keys(updateData).length > 0) {
            updateData.updated_at = new Date().toISOString()
            
            const { error: dbError } = await supabase
                .from('publicaciones')
                .update(updateData)
                .eq('meli_id', meliId)
                .eq('sku', sku)

            if (dbError) {
                console.error('Error actualizando BD:', dbError)
                // No lanzar error aquí porque ML ya se actualizó
            }
        }

        console.log('Actualización exitosa para:', sku)

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: 'Item actualizado correctamente',
                updatedData: updateData
            }),
            { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200 
            }
        )

    } catch (error) {
        console.error('Error en mercadolibre-update-single-item:', error)
        
        return new Response(
            JSON.stringify({ 
                success: false, 
                error: error.message || 'Error interno del servidor'
            }),
            { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500 
            }
        )
    }
})

// Función auxiliar para renovar access token
async function refreshAccessToken(supabase: any, refreshToken: string) {
    try {
        const clientId = Deno.env.get('MERCADOLIBRE_CLIENT_ID')
        const clientSecret = Deno.env.get('MERCADOLIBRE_CLIENT_SECRET')
        
        if (!clientId || !clientSecret) {
            return { success: false, error: 'Credenciales ML no configuradas' }
        }

        const response = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken
            })
        })

        if (!response.ok) {
            return { success: false, error: 'Error renovando token' }
        }

        const data = await response.json()
        
        // Actualizar tokens en BD
        await supabase
            .from('configuracion')
            .update({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                updated_at: new Date().toISOString()
            })
            .eq('plataforma', 'mercadolibre')

        return { success: true, accessToken: data.access_token }
        
    } catch (error) {
        console.error('Error renovando access token:', error)
        return { success: false, error: error.message }
    }
}