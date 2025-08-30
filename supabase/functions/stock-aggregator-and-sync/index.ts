// supabase/functions/stock-aggregator-and-sync/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getRefreshedToken } from '../_shared/meli_token.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// --- SE ELIMINÓ LA FUNCIÓN normalizeSku ---

serve(async (_req) => {
  try {
    console.log("Iniciando el proceso de agregación y sincronización de stock y precios.");

    const { data: ownProducts, error: ownProductsError } = await supabaseAdmin.from('products').select(`sku, cost_price, stock_disponible, supplier:suppliers(markup)`).filter('sku', 'not.is', null);
    if (ownProductsError) throw new Error(`Error al obtener productos propios: ${ownProductsError.message}`);

    const { data: supplierStockItems, error: supplierStockError } = await supabaseAdmin.from('supplier_stock_items').select(`sku, cost_price, quantity, warehouse:warehouses(supplier:suppliers(markup))`);
    if (supplierStockError) throw new Error(`Error al obtener stock de proveedores: ${supplierStockError.message}`);

    const allSourceProducts = [
        ...ownProducts.map(p => ({ ...p, supplier_markup: p.supplier?.markup, type: 'own' })),
        ...supplierStockItems.map(i => ({ ...i, supplier_markup: i.warehouse?.supplier?.markup, stock_disponible: i.quantity, type: 'supplier' }))
    ];

    let allVirtualProducts = [];
    for (const sourceProduct of allSourceProducts) {
      if (!sourceProduct.supplier_markup || sourceProduct.cost_price <= 0) continue;
      try {
        const { data: virtuals, error: engineError } = await supabaseAdmin.functions.invoke('product-rules-engine', { body: { product: { sku: sourceProduct.sku, cost_price: sourceProduct.cost_price, stock_disponible: sourceProduct.stock_disponible }, supplier: { markup: sourceProduct.supplier_markup } } });
        if (engineError) throw engineError;
        if (virtuals) allVirtualProducts.push(...virtuals);
      } catch (e) { console.error(`Error en el motor de reglas para el SKU ${sourceProduct.sku}:`, e.message); }
    }
    
    const aggregatedProducts = allVirtualProducts.reduce((acc, p) => {
      // Usamos el SKU tal cual viene, sin normalizar
      if (!acc[p.sku]) { acc[p.sku] = { sku: p.sku, price: p.price, stock: 0 }; }
      acc[p.sku].stock += p.stock;
      acc[p.sku].price = Math.min(acc[p.sku].price, p.price);
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

    const { data: allListings } = await supabaseAdmin.from('mercadolibre_listings').select('meli_id, sku, price, available_quantity, status, sync_enabled');

    for (const finalProduct of finalProductsToSync) {
      const { sku, price: newSalePrice } = finalProduct;
      
      // La comparación ahora es directa, respetando los espacios
      const listingToUpdate = (allListings || []).find(l => l.sku === sku);
      
      if (!listingToUpdate) continue;
      if (listingToUpdate.sync_enabled === false) continue;

      const publishableStock = Math.max(0, finalProduct.stock);
      const payload: { available_quantity?: number, price?: number, status?: string } = {};
      let needsUpdate = false;
      if (listingToUpdate.available_quantity !== publishableStock) {
          payload.available_quantity = publishableStock;
          needsUpdate = true;
      }
      if (newSalePrice && Math.abs(listingToUpdate.price - newSalePrice) > 0.01) {
          payload.price = newSalePrice;
          needsUpdate = true;
      }
      const newStatus = publishableStock > 0 ? 'active' : 'paused';
      if (listingToUpdate.status !== newStatus) {
          payload.status = newStatus;
          needsUpdate = true;
      }
      if (needsUpdate) {
        console.log(`Actualizando publicación para SKU "${sku}" (${listingToUpdate.meli_id}) en ML con:`, payload);
        const response = await fetch(`https://api.mercadolibre.com/items/${listingToUpdate.meli_id}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          console.error(`Fallo al actualizar ${listingToUpdate.meli_id}:`, await response.json());
        } else {
          console.log(`Publicación ${listingToUpdate.meli_id} actualizada en ML con éxito.`);
          await supabaseAdmin.from('mercadolibre_listings').update({ ...payload, last_synced_at: new Date().toISOString() }).eq('meli_id', listingToUpdate.meli_id);
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