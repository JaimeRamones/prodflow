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

// Función para actualizar un solo ítem en Mercado Libre (maneja simples y variaciones)
async function updateMeliItem(listing: any, accessToken: string) {
    let url: string;
    let body: string;

    if (listing.meli_variation_id) {
      url = `https://api.mercadolibre.com/items/${listing.meli_id}/variations`;
      body = JSON.stringify([{
        id: listing.meli_variation_id,
        available_quantity: listing.publishable_stock,
        // Aquí se podría añadir el precio si también se calcula
      }]);
    } else {
      url = `https://api.mercadolibre.com/items/${listing.meli_id}`;
      body = JSON.stringify({
        available_quantity: listing.publishable_stock,
        status: listing.publishable_stock > 0 ? 'active' : 'paused',
        // Aquí se podría añadir el precio
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

    console.log("Iniciando el proceso de agregación y sincronización de stock.");

    // 1. Obtener todos los SKUs únicos de nuestro inventario y del de proveedores.
    const { data: productSkus } = await supabaseAdmin.from('products').select('sku');
    const { data: supplierSkus } = await supabaseAdmin.from('supplier_stock_items').select('sku');
    const allSkus = [...new Set([
        ...(productSkus || []).map(p => p.sku), 
        ...(supplierSkus || []).map(s => s.sku)
    ])];

    console.log(`Se procesarán ${allSkus.length} SKUs únicos.`);

    // 2. Obtener las credenciales de Mercado Libre (asumimos un solo usuario por ahora).
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('meli_credentials').select('*').single();
    if (tokenError || !tokenData) throw new Error("No se encontraron credenciales de Mercado Libre.");
    
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, tokenData.user_id, supabaseAdmin);
    }
    
    // 3. Procesar cada SKU.
    for (const sku of allSkus) {
      let totalStock = 0;

      // Obtener stock propio (Grimax) y su stock de seguridad
      const { data: myProduct } = await supabaseAdmin.from('products').select('stock_disponible, safety_stock').eq('sku', sku).single();
      if (myProduct) {
        totalStock += (myProduct.stock_disponible || 0) - (myProduct.safety_stock || 0);
      }

      // Obtener stock de proveedores y sus stocks de seguridad
      const { data: supplierItems } = await supabaseAdmin
        .from('supplier_stock_items')
        .select('quantity, warehouses (safety_stock)')
        .eq('sku', sku);
      
      if (supplierItems) {
        for (const item of supplierItems) {
          // Asegurarse de que 'warehouses' no sea un array
          const warehouseData = Array.isArray(item.warehouses) ? item.warehouses[0] : item.warehouses;
          totalStock += (item.quantity || 0) - (warehouseData?.safety_stock || 0);
        }
      }

      const publishableStock = Math.max(0, totalStock);
      console.log(`SKU: ${sku} | Stock Publicable Calculado: ${publishableStock}`);

      // 4. Encontrar las publicaciones de ML que usan este SKU.
      const { data: listingsToUpdate } = await supabaseAdmin
        .from('mercadolibre_listings')
        .select('meli_id, meli_variation_id, available_quantity, status')
        .eq('sku', sku);
      
      if (!listingsToUpdate || listingsToUpdate.length === 0) continue;

      // 5. Actualizar cada publicación en Mercado Libre.
      for (const listing of listingsToUpdate) {
        const needsUpdate = listing.available_quantity !== publishableStock || 
                              (publishableStock > 0 && listing.status !== 'active') ||
                              (publishableStock === 0 && listing.status !== 'paused');

        if (needsUpdate) {
          console.log(`Actualizando publicación ${listing.meli_id} a stock ${publishableStock}`);
          
          await updateMeliItem({
            meli_id: listing.meli_id,
            meli_variation_id: listing.meli_variation_id,
            publishable_stock: publishableStock,
          }, accessToken);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Sincronización de stock agregado completada." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error en la función stock-aggregator-and-sync:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
