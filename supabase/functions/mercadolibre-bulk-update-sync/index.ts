// Ruta: supabase/functions/mercadolibre-bulk-update-sync/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Obtener los filtros y el estado de sincronización desde el frontend
    const { filters, enableSync } = await req.json();
    const { searchTerm, statusFilter, typeFilter, syncFilter } = filters;

    // Construir la consulta de base de datos para encontrar las filas a actualizar
    let query = supabaseAdmin
      .from('mercadolibre_listings')
      .update({ sync_enabled: enableSync });

    // Aplicar los mismos filtros que tiene el usuario en el frontend
    if (searchTerm && searchTerm.trim()) {
      query = query.or(`title.ilike.%${searchTerm.trim()}%,sku.ilike.%${searchTerm.trim()}%`);
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }
    if (typeFilter) {
      query = query.eq('listing_type_id', typeFilter);
    }
     if (syncFilter !== '') { // Este filtro es importante para no actualizar lo que ya está en el estado deseado
      query = query.eq('sync_enabled', syncFilter === 'true');
    }
    
    // Lo más importante: nos aseguramos de no entrar en un bucle o hacer trabajo extra
    // Solo actualizamos las filas que no tienen ya el estado deseado
    query = query.neq('sync_enabled', enableSync);

    const { error } = await query;

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ success: true, message: "Actualización masiva completada." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error en la función de actualización masiva:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});