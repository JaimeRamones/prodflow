// supabase/functions/stock-aggregator-and-sync/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getRefreshedToken } from '../_shared/meli_token.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (_req) => {
  try {
    console.log("Iniciando el proceso de agregación y sincronización de stock y precios.");

    // 1. Obtener todos los SKUs únicos que tienen stock, ya sea propio o de proveedor.
    const { data: productSkus } = await supabaseAdmin.from('products').select('sku, supplier_id, sale_price, cost_price');
    const { data: supplierSkus } = await supabaseAdmin.from('supplier_stock_items').select('sku, cost_price, warehouse_id');
    const allSkus = [...new Set([...(productSkus || []).map(p => p.sku), ...(supplierSkus || []).map(s => s.sku)])];

    console.log(`Se procesarán ${allSkus.length} SKUs únicos.`);

    // 2. Obtener las credenciales de Mercado Libre.
    const { data: tokenData, error: tokenError } = await supabaseAdmin.from('meli_credentials').select('*').single();
    if (tokenError || !tokenData) throw new Error("No se encontraron credenciales de Mercado Libre.");
    
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, tokenData.user_id, supabaseAdmin);
    }
    
    // 3. Procesar cada SKU.
    for (const sku of allSkus) {
      // --- CÁLCULO DE PRECIO ---
      const { data: suppliers } = await supabaseAdmin.from('suppliers').select('id, markup');
      const supplierItem = (supplierSkus || []).find(s => s.sku === sku);
      const mainProduct = (productSkus || []).find(p => p.sku === sku);
      let newSalePrice = mainProduct?.sale_price; // Por defecto, mantenemos el precio actual.
      let newCostPrice = mainProduct?.cost_price;

      if (supplierItem && supplierItem.cost_price > 0) {
        const warehouseId = supplierItem.warehouse_id;
        // Necesitamos encontrar el supplier_id a partir del warehouse_id. Asumimos una relación simple.
        // En una versión futura, esto se podría mejorar. Por ahora, buscamos el proveedor del producto principal.
        const supplier = suppliers?.find(s => s.id === mainProduct?.supplier_id);
        if (supplier) {
          const markup = supplier.markup || 0;
          newSalePrice = supplierItem.cost_price * (1 + (markup / 100));
          newCostPrice = supplierItem.cost_price;

          // Actualizamos el precio de costo y venta en nuestra tabla 'products'
          await supabaseAdmin.from('products')
            .update({ cost_price: newCostPrice, sale_price: newSalePrice })
            .eq('sku', sku);
          console.log(`Precio del producto ${sku} actualizado a ${newSalePrice} basado en el costo del proveedor.`);
        }
      }

      // --- CÁLCULO DE STOCK ---
      let totalStock = 0;
      const { data: myProduct } = await supabaseAdmin.from('products').select('stock_disponible, safety_stock').eq('sku', sku).single();
      if (myProduct) {
        totalStock += (myProduct.stock_disponible || 0) - (myProduct.safety_stock || 0);
      }
      const { data: supplierItemsForStock } = await supabaseAdmin.from('supplier_stock_items').select('quantity, warehouses (safety_stock)').eq('sku', sku);
      if (supplierItemsForStock) {
        for (const item of supplierItemsForStock) {
          totalStock += (item.quantity || 0) - (item.warehouses?.safety_stock || 0);
        }
      }
      const publishableStock = Math.max(0, totalStock);
      console.log(`SKU: ${sku} | Stock Publicable Calculado: ${publishableStock}`);

      // 4. Encontrar y actualizar las publicaciones en Mercado Libre.
      const { data: listingsToUpdate } = await supabaseAdmin.from('mercadolibre_listings').select('meli_id, price, available_quantity, status').eq('sku', sku);
      if (!listingsToUpdate || listingsToUpdate.length === 0) continue;

      for (const listing of listingsToUpdate) {
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
          console.log(`Actualizando publicación ${listing.meli_id} en ML con:`, payload);
          const response = await fetch(`https://api.mercadolibre.com/items/${listing.meli_id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) console.error(`Fallo al actualizar ${listing.meli_id}:`, await response.json());
          else console.log(`Publicación ${listing.meli_id} actualizada en ML con éxito.`);
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