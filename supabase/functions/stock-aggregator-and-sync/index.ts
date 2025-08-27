import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

// Función para refrescar el token de ML
async function getRefreshedToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) {
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

// Función para actualizar un solo ítem en Mercado Libre
async function updateMeliItem(listing: any, accessToken: string) {
    let url: string;
    let body: string;

    if (listing.meli_variation_id) {
      url = `https://api.mercadolibre.com/items/${listing.meli_id}/variations`;
      body = JSON.stringify([{
        id: listing.meli_variation_id,
        price: listing.prodflow_price,
        available_quantity: listing.prodflow_stock,
      }]);
    } else {
      url = `https://api.mercadolibre.com/items/${listing.meli_id}`;
      body = JSON.stringify({
        price: listing.prodflow_price,
        available_quantity: listing.prodflow_stock,
      });
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body,
    });

    if (!response.ok) {
      const errorBody = await response.json();
      console.error(`Failed to update item ${listing.meli_id}: ${errorBody.message}`);
      return false; // Indica que la actualización falló
    }
    return true; // Indica que la actualización fue exitosa
}


serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Obtener las credenciales del único usuario (o adaptar si hay múltiples usuarios)
    const { data: usersWithCreds, error: usersError } = await supabaseAdmin
      .from('meli_credentials')
      .select('user_id, access_token, refresh_token, expires_at');
      
    if (usersError) throw usersError;
    if (!usersWithCreds || usersWithCreds.length === 0) {
      return new Response(JSON.stringify({ message: "No users with ML credentials found to sync." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    let updatedCount = 0;

    // 2. Iterar sobre cada usuario que tenga credenciales
    for (const creds of usersWithCreds) {
      let accessToken = creds.access_token;
      if (creds.expires_at && new Date(creds.expires_at) < new Date()) {
        accessToken = await getRefreshedToken(creds.refresh_token, supabaseAdmin, creds.user_id);
      }

      // 3. Obtener todos los productos y publicaciones de ese usuario
      const { data: products, error: productsError } = await supabaseAdmin
        .from('products')
        .select('sku, stock_disponible, sale_price')
        .eq('user_id', creds.user_id);

      const { data: listings, error: listingsError } = await supabaseAdmin
        .from('mercadolibre_listings')
        .select('sku, meli_id, meli_variation_id, available_quantity, price')
        .eq('user_id', creds.user_id);

      if (productsError || listingsError) {
        console.error(`Error fetching data for user ${creds.user_id}`);
        continue; // Saltar al siguiente usuario si hay un error
      }
      
      // 4. Comparar y actualizar
      for (const product of products) {
        const listingToUpdate = listings.find(l => l.sku === product.sku);

        if (listingToUpdate) {
          const stockChanged = product.stock_disponible !== listingToUpdate.available_quantity;
          const priceChanged = product.sale_price !== listingToUpdate.price;

          if (stockChanged || priceChanged) {
            const success = await updateMeliItem({
              meli_id: listingToUpdate.meli_id,
              meli_variation_id: listingToUpdate.meli_variation_id,
              prodflow_price: product.sale_price,
              prodflow_stock: product.stock_disponible,
            }, accessToken);
            
            if (success) {
              updatedCount++;
              // Actualizar la base de datos local para que no se vuelva a sincronizar innecesariamente
              await supabaseAdmin
                .from('mercadolibre_listings')
                .update({
                  available_quantity: product.stock_disponible,
                  price: product.sale_price,
                  last_synced_at: new Date().toISOString()
                })
                .eq('sku', product.sku)
                .eq('user_id', creds.user_id);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Sync completed. ${updatedCount} items updated.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error) {
    console.error('Error in cron job function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
