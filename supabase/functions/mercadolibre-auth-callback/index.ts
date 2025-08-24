// supabase/functions/mercadolibre-auth-callback/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Manejo de la solicitud pre-vuelo (preflight) para CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code } = await req.json()
    if (!code) {
      throw new Error('No se proporcionó el código de autorización.')
    }

    // Obtenemos los secretos de forma segura desde las variables de entorno de Supabase
    const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID')
    const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')
    // --- ¡IMPORTANTE! Leemos la nueva Redirect URI desde los secretos ---
    const MELI_REDIRECT_URI = Deno.env.get('MELI_REDIRECT_URI')

    if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET || !MELI_REDIRECT_URI) {
      throw new Error('Faltan variables de entorno críticas para la autenticación de Mercado Libre.')
    }

    // Construimos la solicitud para obtener el token de acceso
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

    if (!response.ok) {
      const errorBody = await response.json()
      console.error('Error al obtener el token de Mercado Libre:', errorBody)
      throw new Error(`Error del servidor de Mercado Libre: ${response.statusText}`)
    }

    const data = await response.json()

    // Creamos un cliente de Supabase para interactuar con la base de datos
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Guardamos las credenciales en la tabla 'meli_credentials'
    const { error: dbError } = await supabaseAdmin
      .from('meli_credentials')
      .upsert({
        id: 1, // Usamos un ID fijo para siempre actualizar el mismo registro
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        user_id: data.user_id, // El ID del vendedor en Mercado Libre
        last_updated: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (dbError) {
      throw dbError
    }

    return new Response(JSON.stringify({ success: true, message: 'Credenciales de Mercado Libre guardadas correctamente.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error en la función de callback de Mercado Libre:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
