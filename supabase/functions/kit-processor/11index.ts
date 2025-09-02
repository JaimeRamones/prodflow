// Ruta: supabase/functions/kit-processor/index.ts
// VERSIÓN MULTI-USUARIO: Acepta un 'userId' y filtra todas las consultas

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
    // CAMBIO: Leemos el userId que nos envía el orquestador
    const { userId } = await _req.json();
    if (!userId) throw new Error("Falta el ID del usuario para el procesador de kits.");

    console.log(`Iniciando PROCESADOR DE KITS para el usuario: ${userId}`);
    
    // CAMBIO: Se añade .eq('user_id', userId) a las consultas de datos de usuario
    const { data: ownProducts } = await supabaseAdmin.from('products').select(`sku, cost_price, stock_disponible, supplier_id`).eq('user_id', userId);
    
    // Las tablas de proveedores son compartidas, no necesitan filtro
    const { data: suppliers } = await supabaseAdmin.from('suppliers').select('id, markup');
    const { data: warehouses } = await supabaseAdmin.from('warehouses').select('id, supplier_id');
    const { data: supplierStockItems } = await supabaseAdmin.from('supplier_stock_items').select('sku, cost_price, quantity, warehouse_id');
    
    const productDataMap = new Map();
    (ownProducts || []).forEach(p => { if (p.sku) { const supplier = suppliers.find(s => s.id === p.supplier_id); productDataMap.set(p.sku, { ...p, supplier_markup: supplier?.markup }); } });
    (supplierStockItems || []).forEach(i => { if (i.sku) { const warehouse = warehouses.find(w => w.id === i.warehouse_id); const supplier = suppliers.find(s => s.id === warehouse?.supplier_id); productDataMap.set(i.sku, { sku: i.sku, cost_price: i.cost_price || 0, stock_disponible: i.quantity || 0, supplier_markup: supplier?.markup }); } });
    const allSourceProducts = Array.from(productDataMap.values());

    let allVirtualProducts = [];
    for (const sourceProduct of allSourceProducts) {
      const markup = sourceProduct.supplier_markup;
      if (!markup || sourceProduct.cost_price <= 0) continue;

      try {
        // CAMBIO: Se pasa el 'userId' al motor de reglas
        const { data: virtuals, error: engineError } = await supabaseAdmin.functions.invoke('product-rules-engine', { body: { product: sourceProduct, supplier: { markup }, userId: userId } });
        if (engineError) throw engineError;
        if (virtuals) allVirtualProducts.push(...virtuals);
      } catch (e) { console.error(`Error en motor de reglas para SKU ${sourceProduct.sku}:`, e.message); }
    }
    
    const kitAndPremiumProducts = allVirtualProducts.filter(p => p.sku.includes('/') || p.sku.endsWith('-PR'));
    const aggregatedProducts = kitAndPremiumProducts.reduce((acc, p) => {
      const cleanSku = normalizeSku(p.sku);
      if (!acc[cleanSku]) { acc[cleanSku] = { sku: cleanSku, price: p.price, stock: 0 }; }
      acc[cleanSku].stock += p.stock;
      acc[cleanSku].price = Math.min(acc[cleanSku].price, p.price);
      return acc;
    }, {});
    
    const finalProductsToSync = Object.values(aggregatedProducts);
    console.log(`Usuario ${userId}: Se sincronizarán ${finalProductsToSync.length} SKUs de Kits/Premium.`);

    // CAMBIO: Se busca la credencial del usuario específico
    const { data: tokenData } = await supabaseAdmin.from('meli_credentials').select('*').eq('user_id', userId).single();
    if (!tokenData) throw new Error(`No se encontraron credenciales para ${userId}.`);
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, userId, supabaseAdmin);
    }

    for (const finalProduct of finalProductsToSync) {
      const { sku, price: newSalePrice } = finalProduct;
      // CAMBIO: Se busca la publicación del usuario específico
      const { data: listingsToUpdate } = await supabaseAdmin.from('mercadolibre_listings').select('meli_id, price, available_quantity, status').eq('user_id', userId).eq('sku', sku);
      if (!listingsToUpdate || listingsToUpdate.length === 0) continue;

      for (const listing of listingsToUpdate) {
        // ... (Lógica de actualización a ML, es idéntica a la otra función, pero con logs específicos)
        console.log(`(Usuario ${userId}) Actualizando publicación (Kit/Premium) ${listing.meli_id} para SKU "${sku}" con:`, payload);
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Sincro de KITS para ${userId} completada.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (error) {
    console.error(`Error en kit-processor para el usuario: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});