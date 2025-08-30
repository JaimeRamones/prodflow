// supabase/functions/stock-aggregator-and-sync/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getRefreshedToken } from '../_shared/meli_token.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const normalizeSku = (sku: string | null): string => {
    if (!sku) return '';
    const nonBreakingSpace = new RegExp(String.fromCharCode(160), 'g');
    return sku.replace(nonBreakingSpace, ' ').trim().replace(/\s+/g, ' ');
};

serve(async (_req) => {
  try {
    console.log("Iniciando el proceso de agregación y sincronización de stock y precios.");

    // --- INICIO DE LA CORRECCIÓN DEFINITIVA ---
    // Leemos las tablas por separado para hacer la unión de datos manualmente.
    const { data: suppliers, error: suppliersError } = await supabaseAdmin.from('suppliers').select('id, markup');
    if (suppliersError) throw new Error(`Error al obtener proveedores: ${suppliersError.message}`);

    const { data: warehouses, error: warehousesError } = await supabaseAdmin.from('warehouses').select('id, supplier_id');
    if (warehousesError) throw new Error(`Error al obtener almacenes: ${warehousesError.message}`);

    const { data: ownProducts, error: ownProductsError } = await supabaseAdmin.from('products').select(`sku, cost_price, stock_disponible, supplier_id`);
    if (ownProductsError) throw new Error(`Error al obtener productos propios: ${ownProductsError.message}`);

    const { data: supplierStockItems, error: supplierStockError } = await supabaseAdmin.from('supplier_stock_items').select(`sku, cost_price, quantity, warehouse_id`);
    if (supplierStockError) throw new Error(`Error al obtener stock de proveedores: ${supplierStockError.message}`);
    
    // Unimos los datos manualmente en el código para asegurar la conexión
    const allSourceProducts = [
        ...(ownProducts || []).map(p => {
            const supplier = suppliers.find(s => s.id === p.supplier_id);
            return { ...p, supplier_markup: supplier?.markup, type: 'propio' };
        }),
        ...(supplierStockItems || []).map(i => {
            const warehouse = warehouses.find(w => w.id === i.warehouse_id);
            const supplier = suppliers.find(s => s.id === warehouse?.supplier_id);
            return { ...i, supplier_markup: supplier?.markup, stock_disponible: i.quantity, type: 'proveedor' };
        })
    ];
    // --- FIN DE LA CORRECCIÓN DEFINITIVA ---

    console.log(`Se procesarán ${allSourceProducts.length} items base (propios y de proveedores).`);

    let allVirtualProducts = [];
    for (const sourceProduct of allSourceProducts) {
      if (!sourceProduct.supplier_markup || sourceProduct.cost_price <= 0) {
        console.warn(`SKU '${sourceProduct.sku}' ignorado. Razón: sin markup (${sourceProduct.supplier_markup}) o costo inválido (${sourceProduct.cost_price}).`);
        continue;
      }
      try {
        const { data: virtuals, error: engineError } = await supabaseAdmin.functions.invoke('product-rules-engine', { body: { product: { sku: sourceProduct.sku, cost_price: sourceProduct.cost_price, stock_disponible: sourceProduct.stock_disponible }, supplier: { markup: sourceProduct.supplier_markup } } });
        if (engineError) throw engineError;
        if (virtuals) allVirtualProducts.push(...virtuals);
      } catch (e) { console.error(`Error en el motor de reglas para el SKU ${sourceProduct.sku}:`, e.message); }
    }
    
    const aggregatedProducts = allVirtualProducts.reduce((acc, p) => {
      const cleanSku = normalizeSku(p.sku);
      if (!acc[cleanSku]) { acc[cleanSku] = { sku: cleanSku, price: p.price, stock: 0 }; }
      acc[cleanSku].stock += p.stock;
      acc[cleanSku].price = Math.min(acc[cleanSku].price, p.price);
      return acc;
    }, {});
    
    const finalProductsToSync = Object.values(aggregatedProducts);
    console.log(`Se sincronizarán ${finalProductsToSync.length} SKUs únicos a Mercado Libre.`);

    const { data: tokenData, error: tokenError } = await supabaseAdmin.from('meli_credentials').select('*').single();
    if (tokenError || !tokenData) throw new Error("No se encontraron credenciales de Mercado Libre.");
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, tokenData.user_id, supabaseAdmin);
    }

    for (const finalProduct of finalProductsToSync) {
      const { sku, price: newSalePrice } = finalProduct;
      const cleanSkuForComparison = normalizeSku(sku);
      
      const { data: listingsToUpdate } = await supabaseAdmin
        .from('mercadolibre_listings')
        .select('meli_id, price, available_quantity, status, sync_enabled')
        .ilike('sku', cleanSkuForComparison);
      
      if (!listingsToUpdate || listingsToUpdate.length === 0) continue;

      for (const listing of listingsToUpdate) {
        if (listing.sync_enabled === false) continue;
        const publishableStock = Math.max(0, finalProduct.stock);
        const payload: { available_quantity?: number, price?: number, status?: string } = {};
        let needsUpdate = false;
        if (listing.available_quantity !== publishableStock) {
            payload.available_quantity = publishableStock;
            needsUpdate = true;
        }
        if (newSalePrice && Math.abs(listing.price - newSalePrice) > 0.01) {
            payload.price = newSalePrice;
            needsUpdate = true;
        }
        const newStatus = publishableStock > 0 ? 'active' : 'paused';
        if (listing.status !== newStatus) {
            payload.status = newStatus;
            needsUpdate = true;
        }
        if (needsUpdate) {
          console.log(`Actualizando publicación para SKU "${sku}" (${listing.meli_id}) en ML con:`, payload);
          const response = await fetch(`https://api.mercadolibre.com/items/${listing.meli_id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            console.error(`Fallo al actualizar ${listing.meli_id}:`, await response.json());
          } else {
            console.log(`Publicación ${listing.meli_id} actualizada en ML con éxito.`);
            await supabaseAdmin.from('mercadolibre_listings').update({ ...payload, last_synced_at: new Date().toISOString() }).eq('meli_id', listing.meli_id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Sincronización de stock y precios completada." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (error) {
    console.error('Error en la función stock-aggregator-and-sync:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});