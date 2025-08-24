// Ruta: supabase/functions/mercadolibre-validate-listing/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const listingData = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('User not found');

    const { data: mlTokens } = await supabaseClient
      .from('mercadolibre_tokens')
      .select('access_token') // Solo necesitamos el access_token para validar
      .eq('user_id', user.id)
      .single();

    if (!mlTokens) throw new Error('Mercado Libre token not found.');

    const validationUrl = `https://api.mercadolibre.com/items/validate`;

    const response = await fetch(validationUrl, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${mlTokens.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(listingData)
    });

    if (response.status === 204) {
      return new Response(JSON.stringify({ success: true, message: "Validación exitosa." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    
    const errorData = await response.json();
    // Usamos el campo 'cause' si existe, que a veces es más detallado
    const errorMessage = errorData.cause?.[0]?.message || errorData.message || 'Error desconocido';
    throw new Error(`Error de validación de Mercado Libre: ${errorMessage}`);

  } catch (error) {
    console.error("Error en la función de validación:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})