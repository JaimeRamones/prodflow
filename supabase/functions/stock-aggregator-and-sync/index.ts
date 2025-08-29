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

    // --- PASO 1: OBTENER TODOS LOS PRODUCTOS BASE (PROPIOS Y DE PROVEEDORES) ---
    // Usamos `select` con joins para obtener la info del proveedor y su markup
    const { data: ownProducts, error: ownProductsError } = await supabaseAdmin
      .from('products')
      .select(`sku, cost_price, stock_disponible, supplier:suppliers(markup)`)
      .filter('sku', 'not.is', null);
    if (ownProductsError) throw new Error(`Error al obtener productos propios: ${ownProductsError.message}`);

    const { data: supplierStockItems, error: supplierStockError } = await supabaseAdmin
      .from('supplier_stock_items')
      .select(`sku, cost_price, quantity, warehouse:warehouses(supplier:suppliers(markup))`)
      .filter('sku', 'not.is', null);
    if (supplierStockError) throw new Error(`Error al obtener stock de proveedores: ${supplierStockError.message}`);

    const allSourceProducts = [
        ...ownProducts.map(p => ({ ...p, supplier_markup: p.supplier?.markup, type: 'own' })),
        ...supplierStockItems.map(i => ({ ...i, supplier_markup: i.warehouse?.supplier?.markup, stock_disponible: i.quantity, type: 'supplier' }))
    ];

    console.log(`Se procesarán ${allSourceProducts.length} items base (propios y de proveedores).`);

    // --- PASO 2: INVOCAR EL MOTOR DE REGLAS PARA CADA PRODUCTO BASE ---
    let allVirtualProducts = [];
    for (const sourceProduct of allSourceProducts) {
      if (!sourceProduct.supplier_markup || sourceProduct.cost_price <= 0) {
        continue;
      }
      
      try {
        const { data: virtuals, error: engineError } = await supabaseAdmin.functions.invoke('product-rules-engine', {
          body: { 
            product: { 
              sku: sourceProduct.sku, 
              cost_price: sourceProduct.cost_price, 
              stock_disponible: sourceProduct.stock_disponible 
            },
            supplier: { markup: sourceProduct.supplier_markup }
          }
        });

        if (engineError) throw engineError;
        if (virtuals) allVirtualProducts.push(...virtuals);
        
      } catch (e) {
        console.error(`Error en el motor de reglas para el SKU ${sourceProduct.sku}:`, e.message);
      }
    }
    
    console.log(`Motor de reglas generó un total de ${allVirtualProducts.length} productos virtuales (con duplicados).`);

    // --- PASO 3: AGREGAR LOS PRODUCTOS VIRTUALES POR SKU ---
    const aggregatedProducts = allVirtualProducts.reduce((acc, p) => {
      if (!acc[p.sku]) {
        // Si es la primera vez que vemos este SKU, lo inicializamos
        acc[p.sku] = { sku: p.sku, price: p.price, stock: 0 };
      }
      // Sumamos el stock de todas las fuentes (propia, proveedor A, proveedor B, etc.)
      acc[p.sku].stock += p.stock;
      // Nos quedamos con el precio más bajo en caso de conflicto
      acc[p.sku].price = Math.min(acc[p.sku].price, p.price);
      return acc;
    }, {});
    
    const finalProductsToSync = Object.values(aggregatedProducts);
    console.log(`Se sincronizarán ${finalProductsToSync.length} SKUs únicos a Mercado Libre.`);

    // --- PASO 4: OBTENER CREDENCIALES Y SINCRONIZAR CON MERCADO LIBRE ---
    const { data: tokenData, error: tokenError } = await supabaseAdmin.from('meli_credentials').select('*').single();
    if (tokenError || !tokenData) throw new Error("No se encontraron credenciales de Mercado Libre.");
    
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, tokenData.user_id, supabaseAdmin);
    }

    // El loop principal ahora itera sobre los productos finales agregados por el motor de reglas
    for (const finalProduct of finalProductsToSync) {
      const { sku, price: newSalePrice } = finalProduct;
      const publishableStock = Math.max(0, finalProduct.stock);

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
          console.log(`Actualizando publicación para SKU ${sku} (${listing.meli_id}) en ML con:`, payload);
          const response = await fetch(`https://api.mercadolibre.com/items/${listing.meli_id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            console.error(`Fallo al actualizar ${listing.meli_id}:`, await response.json());
          } else {
            console.log(`Publicación ${listing.meli_id} actualizada en ML con éxito.`);
            // Actualizamos nuestra DB local para reflejar el cambio inmediatamente
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