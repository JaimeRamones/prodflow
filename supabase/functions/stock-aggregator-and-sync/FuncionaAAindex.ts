// Ruta: supabase/functions/stock-aggregator-and-sync/index.ts
// VERSIÓN MULTI-USUARIO: Acepta un 'userId' y filtra todas las consultas

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
    // CAMBIO: Leemos el userId que nos envía el orquestador
    const { userId } = await _req.json();
    if (!userId) throw new Error("Falta el ID del usuario para la sincronización.");

    console.log(`Iniciando SINCRO BASE para el usuario: ${userId}`);

    // CAMBIO: Se añade .eq('user_id', userId) para filtrar por usuario
    const { data: productSkus } = await supabaseAdmin.from('products').select('sku, supplier_id, sale_price, cost_price, stock_disponible').eq('user_id', userId);
    
    // Las tablas de proveedores son compartidas, no necesitan filtro de usuario
    const { data: supplierSkus } = await supabaseAdmin.from('supplier_stock_items').select('sku, cost_price, quantity, warehouse_id');
    const { data: suppliers } = await supabaseAdmin.from('suppliers').select('id, markup');
    const { data: warehouses } = await supabaseAdmin.from('warehouses').select('id, supplier_id');

    const allSkus = [...new Set([...(productSkus || []).map(p => p.sku), ...(supplierSkus || []).map(s => s.sku)])];

    console.log(`Usuario ${userId}: Se procesarán ${allSkus.length} SKUs únicos.`);

    // CAMBIO: Se busca la credencial del usuario específico
    const { data: tokenData, error: tokenError } = await supabaseAdmin.from('meli_credentials').select('*').eq('user_id', userId).single();
    if (tokenError || !tokenData) throw new Error(`No se encontraron credenciales para el usuario ${userId}.`);
    
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, userId, supabaseAdmin);
    }
    
    for (const sku of allSkus) {
      if(!sku) continue;

      const supplierItem = (supplierSkus || []).find(s => s.sku === sku);
      const mainProduct = (productSkus || []).find(p => p.sku === sku);
      let newSalePrice = mainProduct?.sale_price;
      
      if (supplierItem && supplierItem.cost_price > 0) {
        const warehouse = warehouses?.find(w => w.id === supplierItem.warehouse_id);
        const supplier = suppliers?.find(s => s.id === warehouse?.supplier_id);
        if (supplier && supplier.markup) {
          const calculatedPrice = supplierItem.cost_price * (1 + (supplier.markup / 100));
          newSalePrice = parseFloat(calculatedPrice.toFixed(2));
        }
      }
      
      let totalStock = 0;
      if (mainProduct && mainProduct.stock_disponible > 0) {
          totalStock += mainProduct.stock_disponible;
      }
      if (supplierItem && supplierItem.quantity > 0) {
          totalStock += supplierItem.quantity;
      }
      const publishableStock = Math.max(0, totalStock);

      // CAMBIO: Se busca la publicación del usuario específico
      const { data: listingsToUpdate } = await supabaseAdmin.from('mercadolibre_listings').select('meli_id, price, available_quantity, status').eq('user_id', userId).eq('sku', sku);
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
          console.log(`(Usuario ${userId}) Actualizando publicación (base) ${listing.meli_id} para SKU "${sku}" con:`, payload);
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

    return new Response(JSON.stringify({ success: true, message: `Sincro BASE para ${userId} completada.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (error) {
    console.error(`Error en stock-aggregator-and-sync: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});