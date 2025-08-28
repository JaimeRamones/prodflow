// --- VERSIÓN DE DIAGNÓSTICO FINAL ---
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

// --- Pega aquí tus funciones auxiliares getRefreshedToken y updateMeliItem ---
async function getRefreshedToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) { /* ... tu código ... */ }
async function updateMeliItem(listing: any, accessToken: string) { /* ... tu código ... */ }


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
      let accessToken = tokenData.access_token; // Asume que es válido por simplicidad
      
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

        // --- LÍNEA DE DIAGNÓSTICO CLAVE ---
        console.log(`[DIAGNÓSTICO] Para SKU ${listing.sku}, la BD respondió:`, JSON.stringify(data));

        if (error || !data || data.length === 0) {
          console.error(`Error calculando datos para SKU ${listing.sku}:`, error?.message);
          continue;
        }

        const { publishable_stock, publishable_price } = data[0];
        
        const stockNeedsUpdate = listing.available_quantity !== publishable_stock;
        const priceNeedsUpdate = publishable_price > 0 && Math.abs((listing.price || 0) - publishable_price) > 0.01;

        if (stockNeedsUpdate || priceNeedsUpdate) {
          console.log(`Actualizando SKU "${listing.sku}" -> Stock REAL ENVIADO: ${publishable_stock}, Precio: ${publishable_price}`);
          
          await updateMeliItem({
            meli_id: listing.meli_id,
            meli_variation_id: listing.meli_variation_id,
            publishable_stock: publishable_stock,
            publishable_price: publishable_price,
            current_status: listing.status
          }, accessToken);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Sync de diagnóstico completo." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (error) {
    console.error('Fatal error in sync function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
});