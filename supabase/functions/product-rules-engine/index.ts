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

    const { data: ownProducts } = await supabaseAdmin.from('products').select(`sku, cost_price, stock_disponible, supplier:suppliers(markup)`).filter('sku', 'not.is', null);
    const { data: supplierStockItems } = await supabaseAdmin.from('supplier_stock_items').select(`sku, cost_price, quantity, warehouse:warehouses(supplier:suppliers(markup))`).filter('sku', 'not.is', null);

    const allSourceProducts = [
        ...(ownProducts || []).map(p => ({ ...p, supplier_markup: p.supplier?.markup, type: 'propio' })),
        ...(supplierStockItems || []).map(i => ({ ...i, supplier_markup: i.warehouse?.supplier?.markup, stock_disponible: i.quantity, type: 'proveedor' }))
    ];

    let allVirtualProducts = [];
    for (const sourceProduct of allSourceProducts) {
      if (!sourceProduct.supplier_markup || !sourceProduct.cost_price || sourceProduct.cost_price <= 0) continue;
      try {
        const { data: virtuals } = await supabaseAdmin.functions.invoke('product-rules-engine', { body: { product: { sku: sourceProduct.sku, cost_price: sourceProduct.cost_price, stock_disponible: sourceProduct.stock_disponible }, supplier: { markup: sourceProduct.supplier_markup } } });
        if (virtuals) {
            // Añadimos la fuente a cada producto virtual para depuración
            allVirtualProducts.push(...virtuals.map(v => ({...v, source_type: sourceProduct.type, source_cost: sourceProduct.cost_price })));
        }
      } catch (e) { console.error(`Error en el motor de reglas para el SKU ${sourceProduct.sku}:`, e.message); }
    }
    
    // --- INICIO DE LA DEPURACIÓN AVANZADA DE PRECIOS ---
    console.log("--- DEPURACIÓN DE PRECIOS PARA 'ACONTI CT 1126' ---");
    const acontiVirtuals = allVirtualProducts.filter(p => normalizeSku(p.sku) === 'ACONTI CT 1126');
    if (acontiVirtuals.length > 0) {
        console.log(`Se encontraron ${acontiVirtuals.length} versiones de ACONTI CT 1126 antes de agregar:`);
        acontiVirtuals.forEach(p => {
            console.log(`  -> Origen: ${p.source_type}, Costo de Origen: ${p.source_cost}, Precio de Venta Calculado: ${p.price}`);
        });
    } else {
        console.log("No se generó ningún producto virtual para ACONTI CT 1126.");
    }
    // --- FIN DE LA DEPURACIÓN ---

    const aggregatedProducts = allVirtualProducts.reduce((acc, p) => {
      const cleanSku = normalizeSku(p.sku);
      if (!acc[cleanSku]) { acc[cleanSku] = { sku: cleanSku, price: p.price, stock: 0 }; }
      acc[cleanSku].stock += p.stock;
      acc[cleanSku].price = Math.min(acc[cleanSku].price, p.price);
      return acc;
    }, {});
    
    const finalProductsToSync = Object.values(aggregatedProducts);

    // ... (El resto del código de sincronización con ML no necesita cambios)
    const { data: tokenData } = await supabaseAdmin.from('meli_credentials').select('*').single();
    if (!tokenData) throw new Error("No se encontraron credenciales de Mercado Libre.");
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, tokenData.user_id, supabaseAdmin);
    }
    const { data: allListings } = await supabaseAdmin.from('mercadolibre_listings').select('meli_id, sku, price, available_quantity, status');
    for (const finalProduct of finalProductsToSync) {
      const { sku, price: newSalePrice } = finalProduct;
      const cleanSkuForComparison = normalizeSku(sku);
      const listingToUpdate = (allListings || []).find(l => normalizeSku(l.sku) === cleanSkuForComparison);
      if (!listingToUpdate) continue;
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