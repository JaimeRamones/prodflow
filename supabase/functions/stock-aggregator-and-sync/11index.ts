// --- VERSIÓN FINAL Y DEFINITIVA (29 de Agosto, 2025) ---
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

async function getRefreshedToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) {
    // ... (Tu código para refrescar el token va aquí, no necesita cambios)
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

async function updateMeliItem(listing: any, accessToken: string) {
    let url: string;
    let payload: any;
    
    const newStatus = listing.publishable_stock > 0 ? 'active' : 'paused';

    if (listing.meli_variation_id) {
        url = `https://api.mercadolibre.com/items/${listing.meli_id}/variations`;
        payload = {
            variations: [{
                id: listing.meli_variation_id,
                available_quantity: listing.publishable_stock,
            }]
        };
    } else {
        url = `https://api.mercadolibre.com/items/${listing.meli_id}`;
        // --- CAMBIO CLAVE: Siempre incluimos el estado en la solicitud ---
        payload = {
            available_quantity: listing.publishable_stock,
            status: newStatus
        };
    }

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error(`Fallo al actualizar item ${listing.meli_id}:`, errorBody);
        return false;
    }
    return true;
}


serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data: allUserCredentials } = await supabaseAdmin.from('meli_credentials').select('*');
    if (!allUserCredentials) return new Response(JSON.stringify({ success: true, message: "No users to sync." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

    for (const tokenData of allUserCredentials) {
      const userId = tokenData.user_id;
      let accessToken = tokenData.access_token;
      if (new Date(tokenData.expires_at) < new Date()) {
          accessToken = await getRefreshedToken(tokenData.refresh_token, supabaseAdmin, userId);
      }
      
      const { data: listings } = await supabaseAdmin
        .from('mercadolibre_listings')
        .select('sku, meli_id, meli_variation_id, available_quantity, status, price')
        .eq('user_id', userId)
        .neq('sku', null);

      if (!listings) continue;

      for (const listing of listings) {
        const { data, error } = await supabaseAdmin.rpc('get_publishable_data_for_sku', {
          target_sku: listing.sku,
          target_user_id: userId,
        });

        if (error || !data || data.length === 0) {
          console.error(`Error calculando datos para SKU ${listing.sku}:`, error?.message);
          continue;
        }

        const { publishable_stock } = data[0];
        
        if (listing.available_quantity !== publishable_stock) {
          console.log(`Actualizando SKU "${listing.sku}" -> Enviando Stock: ${publishable_stock}`);
          
          await updateMeliItem({
            meli_id: listing.meli_id,
            meli_variation_id: listing.meli_variation_id,
            publishable_stock: publishable_stock
          }, accessToken);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Sincronización final completada." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (error) {
    console.error('Fatal error in sync function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
});