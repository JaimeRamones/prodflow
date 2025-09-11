// Ruta: supabase/functions/mercadolibre-bulk-update-safety-stock/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { filters, safetyStock } = await req.json()
    
    if (safetyStock === undefined || safetyStock === null) {
      return new Response(
        JSON.stringify({ error: 'safetyStock es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Crear cliente admin de Supabase
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Construir la query base
    let query = supabaseAdmin.from('mercadolibre_listings').select('id')

    // Aplicar filtros si existen
    if (filters.searchTerm?.trim()) {
      query = query.or(`title.ilike.%${filters.searchTerm.trim()}%,sku.ilike.%${filters.searchTerm.trim()}%`)
    }
    if (filters.statusFilter) {
      query = query.eq('status', filters.statusFilter)
    }
    if (filters.typeFilter) {
      query = query.eq('listing_type_id', filters.typeFilter)
    }
    if (filters.syncFilter !== '') {
      query = query.eq('sync_enabled', filters.syncFilter === 'true')
    }

    // Obtener todos los IDs que coinciden con los filtros
    const { data: matchingPublications, error: selectError } = await query

    if (selectError) {
      throw new Error(`Error al buscar publicaciones: ${selectError.message}`)
    }

    if (!matchingPublications || matchingPublications.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No se encontraron publicaciones que coincidan con los filtros' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Actualizar en lotes para evitar timeouts
    const BATCH_SIZE = 1000
    const publicationIds = matchingPublications.map(p => p.id)
    let totalUpdated = 0

    for (let i = 0; i < publicationIds.length; i += BATCH_SIZE) {
      const batch = publicationIds.slice(i, i + BATCH_SIZE)
      
      const { error: updateError } = await supabaseAdmin
        .from('mercadolibre_listings')
        .update({ safety_stock: safetyStock })
        .in('id', batch)

      if (updateError) {
        throw new Error(`Error al actualizar lote ${i / BATCH_SIZE + 1}: ${updateError.message}`)
      }

      totalUpdated += batch.length
    }

    return new Response(
      JSON.stringify({ 
        message: `Stock de seguridad actualizado exitosamente para ${totalUpdated} publicaciones`,
        updated_count: totalUpdated
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error en bulk update safety stock:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})