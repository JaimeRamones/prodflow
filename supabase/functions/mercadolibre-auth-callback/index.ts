import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code } = await req.json()
    if (!code) throw new Error("Authorization code not provided.")

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('User not found')

    const MELI_APP_ID = Deno.env.get('MELI_APP_ID')
    const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')
    const REDIRECT_URI = Deno.env.get('MELI_REDIRECT_URI')

    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: MELI_APP_ID!,
        client_secret: MELI_CLIENT_SECRET!,
        code: code,
        redirect_uri: REDIRECT_URI!,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`Failed to exchange code for token: ${errorBody.message}`)
    }

    const tokens = await response.json()
    
    // --- CAMBIO CLAVE: Capturamos el ID de usuario de Mercado Libre ---
    const meli_user_id = tokens.user_id;
    const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error } = await supabaseClient
      .from('mercadolibre_tokens')
      .upsert({
        user_id: user.id, // Este es el ID de usuario de ProdFlow/Supabase
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expires_at,
        meli_user_id: meli_user_id, // Guardamos el ID de usuario de Mercado Libre
      }, { onConflict: 'user_id' }) // Le decimos a la DB qué hacer si el usuario ya existe

    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})