import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

// (La función getRefreshedToken se mantiene igual)
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

// (La función updateMeliItem se mantiene igual)
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
        return new Response(JSON.stringify({ success: true, message: "No users to sync." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    for (const tokenData of allUserCredentials) {
      const userId = tokenData.user_id;
      console.log(`Procesando para el usuario: ${userId}`);
      
      let accessToken = tokenData.access_token;
      if (new Date(tokenData.expires_at) < new Date()) {
        console.log(`Token expirado para ${userId}, refrescando...`);
        accessToken = await getRefreshedToken(tokenData.refresh_token, supabaseAdmin, userId);
      }
      
      // 1. Obtener configuración de proveedores y almacenes para el usuario
      const { data: suppliers } = await supabaseAdmin
        .from('suppliers')
        .select('id, markup, warehouse_id')
        .eq('user_id', userId);

      const supplierMarkupMap = new Map(suppliers?.map(s => [s.warehouse_id, s.markup]));
      
      // CAMBIO CLAVE: Lista de IDs de almacenes relevantes para este usuario.
      const relevantWarehouseIds = suppliers?.map(s => s.warehouse_id).filter(id => id != null) || [];

      // 2. Recopilar todos los SKUs únicos.

      // SKUs de productos propios del usuario
      const { data: productSkusData } = await supabaseAdmin.from('products').select('sku').eq('user_id', userId);
      const productSkus = (productSkusData || []).map(p => p.sku);

      // SKUs de los proveedores relevantes (CORREGIDO)
      let supplierSkus: string[] = [];
      if (relevantWarehouseIds.length > 0) {
        // CORREGIDO: Usamos .in('warehouse_id') en lugar de .eq('user_id')
        const { data: supplierSkusData, error } = await supabaseAdmin
                .from('supplier_stock_items')
                .select('sku')
                .in('warehouse_id', relevantWarehouseIds); 
        
        if (error) throw error;
        // Usamos un Set y luego convertimos a Array para asegurar que sean únicos desde el principio
        supplierSkus = [...new Set((supplierSkusData || []).map(s => s.sku))];
      }
      
      // Unión de todos los SKUs
      const allSkus = [...new Set([...productSkus, ...supplierSkus])];

      console.log(`Usuario ${userId} tiene ${allSkus.length} SKUs únicos para procesar.`);

      // 3. Iterar y agregar stock/precio para cada SKU
      for (const sku of allSkus) {
        let totalStock = 0;
        // Unificamos el costo bajo la propiedad 'cost' para la lógica interna
        const sources: { cost: number; warehouse_id: string | null }[] = [];

        // Stock propio del usuario (Se mantiene igual, asumiendo que 'cost' es correcto en la tabla 'products')
        const { data: myProduct } = await supabaseAdmin.from('products').select('stock_disponible, safety_stock, cost, supplier_id, warehouses!inner(id)').eq('sku', sku).eq('user_id', userId).single();
        if (myProduct) {
          totalStock += (myProduct.stock_disponible || 0) - (myProduct.safety_stock || 0);
          if (myProduct.cost) {
            sources.push({ cost: myProduct.cost, warehouse_id: myProduct.warehouses?.id || null });
          }
        }

        // Stock de proveedores (CORREGIDO)
        if (relevantWarehouseIds.length > 0) {
            const { data: supplierItems, error } = await supabaseAdmin
                .from('supplier_stock_items')
                // CORREGIDO: Seleccionamos 'cost_price' en lugar de 'cost'
                .select('quantity, cost_price, warehouse_id, warehouses (safety_stock)') 
                .eq('sku', sku)
                // CORREGIDO: Filtramos por almacenes relevantes
                .in('warehouse_id', relevantWarehouseIds);

            if (error) throw error;
            
            if (supplierItems) {
              for (const item of supplierItems) {
                const warehouseData = Array.isArray(item.warehouses) ? item.warehouses[0] : item.warehouses;
                totalStock += (item.quantity || 0) - (warehouseData?.safety_stock || 0);
                    // CORREGIDO: Usamos item.cost_price y lo mapeamos a 'cost'
                if (item.cost_price) {
                  sources.push({ cost: item.cost_price, warehouse_id: item.warehouse_id });
                }
              }
            }
        }

        // 4. Cálculo de stock y precio publicable
        const publishableStock = Math.max(0, totalStock);
        
        let publishablePrice: number | undefined = undefined;
        if (sources.length > 0) {
          // Encontrar la fuente con el costo más bajo
          const bestSource = sources.reduce((prev, current) => (prev.cost < current.cost) ? prev : current);
          // Aplicar el markup correspondiente
          const markupPercentage = supplierMarkupMap.get(bestSource.warehouse_id) || 0;
          const markup = 1 + (markupPercentage / 100);
          publishablePrice = parseFloat((bestSource.cost * markup).toFixed(2));
        }
        
        // 5. Actualizar Mercado Libre si es necesario
        const { data: listingsToUpdate } = await supabaseAdmin.from('mercadolibre_listings').select('meli_id, meli_variation_id, available_quantity, status, price').eq('sku', sku).eq('user_id', userId);
        
        if (!listingsToUpdate || listingsToUpdate.length === 0) continue;

        for (const listing of listingsToUpdate) {
          const stockNeedsUpdate = listing.available_quantity !== publishableStock;
          const priceNeedsUpdate = publishablePrice !== undefined && listing.price !== publishablePrice;
          const statusNeedsUpdate = (publishableStock > 0 && listing.status !== 'active') || (publishableStock === 0 && listing.status !== 'paused');

          if (stockNeedsUpdate || priceNeedsUpdate || statusNeedsUpdate) {
            // Usamos comillas en el log para verificar visualmente los espacios del SKU
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