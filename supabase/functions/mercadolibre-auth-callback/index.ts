// supabase/functions/mercadolibre-auth-callback/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

async function getSupabaseUser(req: Request, supabaseClient: SupabaseClient) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('Missing Authorization header')
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabaseClient.auth.getUser(token)
  if (error) throw error
  if (!user) throw new Error('User not found for provided token')
  return user
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )
    
    const user = await getSupabaseUser(req, supabaseClient)
    const { code } = await req.json()
    if (!code) throw new Error('No authorization code provided.')

    const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID')
    const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')
    const MELI_REDIRECT_URI = Deno.env.get('MELI_REDIRECT_URI')

    if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET || !MELI_REDIRECT_URI) {
      throw new Error('Missing secrets in Supabase config.')
    }

    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: MELI_CLIENT_ID,
        client_secret: MELI_CLIENT_SECRET,
        code: code,
        redirect_uri: MELI_REDIRECT_URI,
      }),
    })
    
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`Mercado Libre Error: ${errorBody.message}`);
    }

    const data = await response.json()

    // --- LA CORRECCIÓN FINAL ESTÁ AQUÍ ---
    // Calculamos la fecha y hora exactas de expiración.
    const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: dbError } = await supabaseAdmin
      .from('meli_credentials')
      .upsert({
        user_id: user.id,
        meli_user_id: data.user_id,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: expires_at, // Guardamos en la columna correcta 'expires_at'.
        last_updated: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (dbError) throw dbError

    return new Response(JSON.stringify({ success: true, message: 'Credentials saved.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })

  } catch (error) {
    console.error('Error in callback function:', error.message)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})