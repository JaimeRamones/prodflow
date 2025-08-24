import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MELI_APP_ID = Deno.env.get('MELI_APP_ID')!
const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')!
const MELI_REDIRECT_URI = Deno.env.get('MELI_REDIRECT_URI')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- INICIO DE LA CORRECCIÓN FINAL ---
    // 1. Creamos el cliente de Supabase como siempre.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 2. Extraemos el token JWT de la cabecera de autorización.
    const authHeader = req.headers.get('Authorization')!
    if (!authHeader) {
      throw new Error('Missing Authorization header.')
    }
    const token = authHeader.replace('Bearer ', '')

    // 3. Obtenemos el usuario PASANDO EL TOKEN EXPLÍCITAMENTE, como en la documentación.
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    if (userError || !user) {
      throw new Error(`Authentication error: ${userError?.message || 'User not found.'}`)
    }
    // --- FIN DE LA CORRECCIÓN FINAL ---

    const { code } = await req.json()
    if (!code) {
      throw new Error('No authorization code provided.')
    }

    const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: MELI_APP_ID,
        client_secret: MELI_CLIENT_SECRET,
        code: code,
        redirect_uri: MELI_REDIRECT_URI
      })
    })

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      throw new Error(`Failed to fetch token from Mercado Libre: ${errorBody}`)
    }

    const tokens = await tokenResponse.json()
    const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error: dbError } = await supabaseClient
      .from('mercadolibre_tokens')
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expires_at
      })

    if (dbError) {
      throw dbError
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error in Edge Function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
