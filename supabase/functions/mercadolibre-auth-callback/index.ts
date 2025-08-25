// supabase/functions/mercadolibre-auth-callback/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code } = await req.json()
    if (!code) {
      throw new Error('No se proporcionó el código de autorización desde el frontend.')
    }

    const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID')
    const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')
    const MELI_REDIRECT_URI = Deno.env.get('MELI_REDIRECT_URI')

    if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET || !MELI_REDIRECT_URI) {
      throw new Error('Faltan secretos en la configuración de Supabase (CLIENT_ID, CLIENT_SECRET, o REDIRECT_URI).')
    }

    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: MELI_CLIENT_ID,
        client_secret: MELI_CLIENT_SECRET,
        code: code,
        redirect_uri: MELI_REDIRECT_URI,
      }),
    })

    // --- ESTA ES LA MEJORA ---
    // Si la respuesta de Mercado Libre no es exitosa, capturamos el error detallado.
    if (!response.ok) {
      const errorBody = await response.json();
      console.error('Error detallado de Mercado Libre:', errorBody);
      // Creamos un mensaje de error claro para el frontend.
      throw new Error(`Error de Mercado Libre: ${errorBody.error} - ${errorBody.message}`);
    }

    const data = await response.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: dbError } = await supabaseAdmin
      .from('meli_credentials')
      .upsert({
        id: 1,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        user_id: data.user_id,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (dbError) throw dbError

    return new Response(JSON.stringify({ success: true, message: 'Credenciales guardadas.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error en la función de callback:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400, // Devolvemos un 400 para que el frontend lo pueda leer
    })
  }
})
