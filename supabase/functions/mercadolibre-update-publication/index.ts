import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

// Función auxiliar para refrescar el token (Se mantiene igual)
async function getRefreshedToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) {
  const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID')!
  const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')!
  // ... (resto de la función getRefreshedToken) ...
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
    // 1. Configuración y Validación
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('User not found')

    const { listing } = await req.json();
    if (!listing || !listing.meli_id) throw new Error("Listing data with meli_id is required.");

    const targetPrice = parseFloat(listing.prodflow_price);
    const targetStock = parseInt(listing.prodflow_stock);

    if (isNaN(targetPrice) || targetPrice <= 0) throw new Error("Invalid prodflow_price.");
    if (isNaN(targetStock) || targetStock < 0) throw new Error("Invalid prodflow_stock.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Obtener Tokens
    let { data: mlTokens } = await supabaseAdmin
      .from('meli_credentials').select('*').eq('user_id', user.id).single()

    if (!mlTokens) throw new Error('Mercado Libre token not found.');
    
    if (mlTokens.expires_at && new Date(mlTokens.expires_at) < new Date()) {
      mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, supabaseAdmin, user.id)
    }

    // 3. Preparar la llamada a la API de ML
    // Mantenemos la lógica original del usuario ya que parece funcionar para actualizaciones parciales.
    let url: string;
    let body: string;

    if (listing.meli_variation_id) {
      url = `https://api.mercadolibre.com/items/${listing.meli_id}/variations`;
      body = JSON.stringify([{
        id: listing.meli_variation_id,
        price: targetPrice,
        available_quantity: targetStock,
      }]);
    } else {
      url = `https://api.mercadolibre.com/items/${listing.meli_id}`;
      body = JSON.stringify({
        price: targetPrice,
        available_quantity: targetStock,
      });
    }

    // 4. Ejecutar la actualización en Mercado Libre
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
      console.error("ML API Error:", errorBody);
      throw new Error(`ML API Error: ${errorBody.message || 'Unknown error'}. Detail: ${JSON.stringify(errorBody.cause)}`);
    }

    const result = await response.json();

    // 5. Actualización Inmediata de la Base de Datos Local (¡Paso Crucial!)
    // Actualizamos la tabla para que la App refleje los cambios inmediatamente.
    const updateData = {
        price: targetPrice,             // Actualizamos el precio de ML
        available_quantity: targetStock, // Actualizamos el stock de ML
        last_synced_at: new Date().toISOString(),
    };

    let query = supabaseAdmin
        .from('mercadolibre_listings')
        .update(updateData)
        .eq('user_id', user.id)
        .eq('meli_id', listing.meli_id);

    // Filtramos correctamente por variación o producto simple
    if (listing.meli_variation_id) {
        query = query.eq('meli_variation_id', listing.meli_variation_id);
    } else {
        // Para productos simples, meli_variation_id debe ser NULL en la DB
        query = query.is('meli_variation_id', null);
    }

    const { error: updateError } = await query;

    if (updateError) {
        console.error("Failed to update Supabase after successful ML update:", updateError);
        // Devolvemos éxito (porque ML se actualizó) pero con una advertencia.
        return new Response(JSON.stringify({ success: true, data: result, warning: "Updated in ML but failed to sync back to ProdFlow DB." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // Éxito total
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