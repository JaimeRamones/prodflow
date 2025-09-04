import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

// Esta función auxiliar se puede mover a _shared/meli_token.ts si la usas en otras funciones
async function getRefreshedToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) {
  const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID')!
  const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')!
  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: MELI_CLIENT_ID,
      client_secret: MELI_CLIENT_SECRET, refresh_token: refreshToken,
    }),
  })
  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(`Failed to refresh ML token: ${errorBody.message}`);
  }
  const newTokens = await response.json()
  const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
  await supabaseAdmin.from('meli_credentials').update({
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token,
    expires_at: expires_at,
  }).eq('user_id', userId)
  return newTokens.access_token
}

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
    if (!user) throw new Error('User not found')

    // Recibimos el objeto 'listing' completo desde el frontend
    const { listing } = await req.json();
    if (!listing || !listing.meli_id) throw new Error("Listing data with meli_id is required.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let { data: mlTokens, error: tokenError } = await supabaseAdmin
      .from('meli_credentials')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .single()

    if (tokenError || !mlTokens) throw new Error('Mercado Libre token not found.');
    
    if (mlTokens.expires_at && new Date(mlTokens.expires_at) < new Date()) {
      mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, supabaseAdmin, user.id)
    }

    let url: string;
    let body: string;

    // --- LÓGICA CLAVE: Diferenciar entre variación y producto simple ---
    if (listing.meli_variation_id) {
      // Es una variación, el endpoint y el body son diferentes
      url = `https://api.mercadolibre.com/items/${listing.meli_id}/variations`;
      body = JSON.stringify([{
        id: listing.meli_variation_id,
        price: listing.prodflow_price,
        available_quantity: listing.prodflow_stock,
      }]);
    } else {
      // Es un producto simple
      url = `https://api.mercadolibre.com/items/${listing.meli_id}`;
      body = JSON.stringify({
        price: listing.prodflow_price,
        available_quantity: listing.prodflow_stock,
      });
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${mlTokens.access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body,
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`ML API Error: ${errorBody.message || 'Unknown error'}`);
    }

    const result = await response.json();

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in update function:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
