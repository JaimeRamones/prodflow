import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getRefreshedToken } from '../_shared/meli_token.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const listingData = await req.json()
    // ... (El resto de la lógica de la función se mantiene igual hasta el bloque catch)
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
    if (!mlTokens) throw new Error('Mercado Libre token not found.')
    if (new Date(mlTokens.expires_at) < new Date()) {
      mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, user.id, supabaseClient)
    }
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
      })
    }
    const errorData = await response.json();
    throw new Error(`Error de validación de Mercado Libre: ${errorData.message}`);

  } catch (error) {
    // --- CAMBIO CLAVE: Devolvemos el error como texto plano ---
    console.error("Error en el bloque catch:", error.message);
    return new Response(error.message, {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    })
  }
})