// supabase/functions/mercadolibre-update-stock/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getRefreshedToken } from '../_shared/meli_token.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Usuario no encontrado')

    const { meli_id, new_quantity, new_price } = await req.json()
    if (!meli_id) throw new Error('Falta el parámetro meli_id')

    // CORREGIDO: Apuntar a la tabla correcta 'meli_credentials' y obtener más datos
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('meli_credentials')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .single()

    if (tokenError || !tokenData) throw new Error('No se encontraron tokens de Mercado Libre para el usuario.')

    let accessToken = tokenData.access_token;
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
        accessToken = await getRefreshedToken(tokenData.refresh_token, user.id, supabaseClient);
    }
    
    const payload: { available_quantity?: number, price?: number } = {};
    if (new_quantity !== undefined) payload.available_quantity = new_quantity;
    if (new_price !== undefined) payload.price = new_price;

    if (Object.keys(payload).length === 0) {
        throw new Error('No se proporcionó ni cantidad ni precio para actualizar.');
    }

    const updateResponse = await fetch(`https://api.mercadolibre.com/items/${meli_id}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    });

    if (!updateResponse.ok) {
        const errorBody = await updateResponse.json();
        throw new Error(`Error de la API de Mercado Libre: ${errorBody.message}`);
    }

    const updatedListing = await updateResponse.json();

    await supabaseClient
        .from('mercadolibre_listings')
        .update({
            available_quantity: updatedListing.available_quantity,
            price: updatedListing.price,
            last_synced_at: new Date().toISOString()
        })
        .eq('meli_id', meli_id);

    return new Response(JSON.stringify({ 
        success: true, 
        updated_quantity: updatedListing.available_quantity,
        updated_price: updatedListing.price 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })

  } catch (error) {
    console.error('Error en la Edge Function (update-stock):', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})