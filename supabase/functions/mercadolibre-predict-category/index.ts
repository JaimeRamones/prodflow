// Ruta: supabase/functions/mercadolibre-predict-category/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// --- CAMBIO 1: Copiamos la función de refresco aquí para evitar problemas de importación ---
async function getRefreshedToken(
  refreshToken: string, 
  userId: string,
  supabaseClient: any
) {
  const MELI_APP_ID = Deno.env.get('MELI_APP_ID')
  const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')

  if (!MELI_APP_ID || !MELI_CLIENT_SECRET) {
    throw new Error('Missing Mercado Libre credentials in environment variables.')
  }

  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: MELI_APP_ID,
      client_secret: MELI_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    console.error("Failed to refresh token response:", await response.text());
    throw new Error('Failed to refresh Mercado Libre token')
  }

  const newTokens = await response.json()
  const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
  
  await supabaseClient.from('mercadolibre_tokens').update({
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
    const { title } = await req.json()
    if (!title) {
      throw new Error('Title is required to predict a category.')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('User not found')

    let { data: mlTokens } = await supabaseClient
      .from('mercadolibre_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', user.id)
      .single()

    if (!mlTokens) throw new Error('Mercado Libre token not found for user.')

    if (new Date(mlTokens.expires_at) < new Date()) {
      mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, user.id, supabaseClient)
    }

    const siteId = 'MLA'; // Argentina
    const encodedTitle = encodeURIComponent(title);
    const predictionUrl = `https://api.mercadolibre.com/sites/${siteId}/domain_discovery/search?limit=3&q=${encodedTitle}`;

    const response = await fetch(predictionUrl, {
      headers: { 'Authorization': `Bearer ${mlTokens.access_token}` }
    });

    if (!response.ok) {
      throw new Error(`Failed to get category prediction: ${await response.text()}`);
    }

    const predictions = await response.json();

    return new Response(JSON.stringify(predictions), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})