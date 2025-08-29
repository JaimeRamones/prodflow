// --- VERSIÓN FINAL DE DIAGNÓSTICO (PARA PUBLICACIONES SIMPLES) ---
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

// Pega aquí tu función getRefreshedToken si la usas
async function getRefreshedToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) { /* ... tu código ... */ }


// --- FUNCIÓN MODIFICADA PARA "ESPIAR" LA RESPUESTA ---
async function updateMeliItem(listing: any, accessToken: string) {
    const url = `https://api.mercadolibre.com/items/${listing.meli_id}`;
    const payload = {
        available_quantity: listing.publishable_stock,
    };

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
    });

    // --- LÍNEA DE DIAGNÓSTICO CLAVE ---
    // Leemos la respuesta de Mercado Libre SIEMPRE para ver qué nos dice.
    const responseBody = await response.json();
    console.log(`[DIAGNÓSTICO MELI] Respuesta de la API para ${listing.meli_id}:`, JSON.stringify(responseBody));

    if (!response.ok) {
        console.error(`Fallo al actualizar item ${listing.meli_id}:`, responseBody);
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
    
    // --- El resto del código es el que ya tenías ---
    const { data: allUserCredentials } = await supabaseAdmin.from('meli_credentials').select('*');
    if (!allUserCredentials) return new Response(JSON.stringify({ success: true, message: "No users to sync." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

    for (const tokenData of allUserCredentials) {
      const userId = tokenData.user_id;
      let accessToken = tokenData.access_token;
      
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
          console.log(`Actualizando SKU "${listing.sku}" -> Intentando enviar Stock: ${publishable_stock}`);
          
          await updateMeliItem({
            meli_id: listing.meli_id,
            publishable_stock: publishable_stock,
          }, accessToken);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Sync de diagnóstico de MLI completo." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (error) {
    console.error('Fatal error in sync function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
});