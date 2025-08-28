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
    let payload: any;

    if (listing.meli_variation_id) {
      url = `https://api.mercadolibre.com/items/${listing.meli_id}/variations`;
      const variationPayload: { id: any; available_quantity: any; price?: number } = {
        id: listing.meli_variation_id,
        available_quantity: listing.publishable_stock,
      };
      if (listing.publishable_price !== undefined) {
        variationPayload.price = listing.publishable_price;
      }
      payload = [variationPayload];
    } else {
      url = `https://api.mercadolibre.com/items/${listing.meli_id}`;
      const dynamicPayload: { available_quantity: number, status?: string, price?: number } = {
        available_quantity: listing.publishable_stock,
      };
      if (listing.publishable_price !== undefined) {
        dynamicPayload.price = listing.publishable_price;
      }
      const newStatus = listing.publishable_stock > 0 ? 'active' : 'paused';
      if (listing.current_status !== newStatus) {
        dynamicPayload.status = newStatus;
      }
      payload = dynamicPayload;
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
      console.error(`Failed to update item ${listing.meli_id}:`, errorBody);
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

    console.log("Iniciando el proceso de agregación y sincronización de stock y precio.");

    const { data: allUserCredentials, error: credsError } = await supabaseAdmin
      .from('meli_credentials')
      .select('*');

    if (credsError) throw credsError;

    if (!allUserCredentials || allUserCredentials.length === 0) {
      console.log("No se encontraron credenciales de usuarios para sincronizar. Finalizando.");
      return new Response(JSON.stringify({ success: true, message: "No users to sync." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`Se encontraron credenciales para ${allUserCredentials.length} usuario(s).`);

    for (const tokenData of allUserCredentials) {
      const userId = tokenData.user_id;
      console.log(`Procesando para el usuario: ${userId}`);
      
      let accessToken = tokenData.access_token;
      if (new Date(tokenData.expires_at) < new Date()) {
        console.log(`Token expirado para ${userId}, refrescando...`);
        accessToken = await getRefreshedToken(tokenData.refresh_token, supabaseAdmin, userId);
      }
      
      const { data: suppliers } = await supabaseAdmin
        .from('suppliers')
        .select('id, markup, warehouse_id') // Obtenemos también el warehouse_id
        .eq('user_id', userId);

      const supplierMarkupMap = new Map(suppliers?.map(s => [s.warehouse_id, s.markup]));

      const { data: productSkus } = await supabaseAdmin.from('products').select('sku').eq('user_id', userId);
      const { data: supplierSkus } = await supabaseAdmin.from('supplier_stock_items').select('sku').eq('user_id', userId);
      
      const allSkus = [...new Set([
          ...(productSkus || []).map(p => p.sku), 
          ...(supplierSkus || []).map(s => s.sku)
      ])];

      console.log(`Usuario ${userId} tiene ${allSkus.length} SKUs únicos para procesar.`);

      for (const sku of allSkus) {
        let totalStock = 0;
        const sources: { cost: number; warehouse_id: string | null }[] = [];

        const { data: myProduct } = await supabaseAdmin.from('products').select('stock_disponible, safety_stock, cost, supplier_id, warehouses!inner(id)').eq('sku', sku).eq('user_id', userId).single();
        if (myProduct) {
          totalStock += (myProduct.stock_disponible || 0) - (myProduct.safety_stock || 0);
          if (myProduct.cost) {
            // Asumimos que el warehouse del producto propio tiene un ID conocido o se puede obtener
            sources.push({ cost: myProduct.cost, warehouse_id: myProduct.warehouses?.id || null });
          }
        }

        const { data: supplierItems } = await supabaseAdmin.from('supplier_stock_items').select('quantity, cost, warehouse_id, warehouses (safety_stock)').eq('sku', sku).eq('user_id', userId);
        
        if (supplierItems) {
          for (const item of supplierItems) {
            const warehouseData = Array.isArray(item.warehouses) ? item.warehouses[0] : item.warehouses;
            totalStock += (item.quantity || 0) - (warehouseData?.safety_stock || 0);
            if (item.cost) {
              sources.push({ cost: item.cost, warehouse_id: item.warehouse_id });
            }
          }
        }

        const publishableStock = Math.max(0, totalStock);
        
        let publishablePrice: number | undefined = undefined;
        if (sources.length > 0) {
          // Encontrar la fuente con el costo más bajo
          const bestSource = sources.reduce((prev, current) => (prev.cost < current.cost) ? prev : current);
          
          // Obtener el recargo para el almacén de la mejor fuente
          const markupPercentage = supplierMarkupMap.get(bestSource.warehouse_id) || 0;
          const markup = 1 + (markupPercentage / 100);
          publishablePrice = parseFloat((bestSource.cost * markup).toFixed(2));
        }
        
        const { data: listingsToUpdate } = await supabaseAdmin.from('mercadolibre_listings').select('meli_id, meli_variation_id, available_quantity, status, price').eq('sku', sku).eq('user_id', userId);
        
        if (!listingsToUpdate || listingsToUpdate.length === 0) continue;

        for (const listing of listingsToUpdate) {
          const stockNeedsUpdate = listing.available_quantity !== publishableStock;
          const priceNeedsUpdate = publishablePrice !== undefined && listing.price !== publishablePrice;
          const statusNeedsUpdate = (publishableStock > 0 && listing.status !== 'active') || (publishableStock === 0 && listing.status !== 'paused');

          if (stockNeedsUpdate || priceNeedsUpdate || statusNeedsUpdate) {
            console.log(`Actualizando SKU "${sku}" (Pub ID: ${listing.meli_id}) -> Stock: ${publishableStock}, Precio: ${publishablePrice}`);
            
            await updateMeliItem({
              meli_id: listing.meli_id,
              meli_variation_id: listing.meli_variation_id,
              publishable_stock: publishableStock,
              publishable_price: publishablePrice,
              current_status: listing.status
            }, accessToken);
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Sincronización de stock y precio completada para todos los usuarios." }), {
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
