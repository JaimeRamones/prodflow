// Ruta: supabase/functions/stock-aggregator-and-sync/index.ts
// VERSIÓN FINAL: Procesa en lotes y con pausas para evitar timeouts.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getRefreshedToken } from '../_shared/meli_token.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// Función para añadir una pausa entre llamadas a la API
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (_req) => {
  try {
    const { userId } = await _req.json();
    if (!userId) throw new Error("Falta el ID del usuario.");

    console.log(`Iniciando SINCRO BASE para el usuario: ${userId}`);

    // 1. Recolectar toda la información de la base de datos
    const { data: productSkus } = await supabaseAdmin.from('products').select('sku, sale_price, stock_disponible').eq('user_id', userId);
    const { data: supplierSkus } = await supabaseAdmin.from('supplier_stock_items').select('sku, cost_price, quantity, warehouse:warehouses(supplier:suppliers(markup))');
    const { data: listingsToUpdate } = await supabaseAdmin.from('mercadolibre_listings').select('meli_id, sku, price, available_quantity').eq('user_id', userId);

    if (!listingsToUpdate) {
        console.log("No se encontraron publicaciones para sincronizar.");
        return new Response(JSON.stringify({ success: true, message: "No hay publicaciones para sincronizar." }), { headers: corsHeaders });
    }

    // 2. Calcular stock y precio final para cada SKU
    const aggregatedData = new Map<string, { stock: number; price: number | null }>();

    (productSkus || []).forEach(p => {
        aggregatedData.set(p.sku, { stock: p.stock_disponible, price: p.sale_price });
    });

    (supplierSkus || []).forEach(s => {
        const existing = aggregatedData.get(s.sku) || { stock: 0, price: null };
        existing.stock += s.quantity;
        if (!existing.price && s.warehouse?.supplier?.markup && s.cost_price) {
            existing.price = s.cost_price * (1 + s.warehouse.supplier.markup / 100);
        }
        aggregatedData.set(s.sku, existing);
    });

    // 3. Preparar y enviar actualizaciones a Mercado Libre en lotes
    const { data: tokenData } = await supabaseAdmin.from('meli_credentials').select('*').eq('user_id', userId).single();
    if (!tokenData) throw new Error(`No se encontraron credenciales para ${userId}.`);
    
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, userId, supabaseAdmin);
    }

    let updatesCount = 0;
    for (const listing of listingsToUpdate) {
        const data = aggregatedData.get(listing.sku);
        if (!data) continue;

        const { stock, price } = data;
        const payload: { available_quantity?: number; price?: number } = {};
        let needsUpdate = false;

        if (listing.available_quantity !== stock) {
            payload.available_quantity = stock;
            needsUpdate = true;
        }
        if (price && Math.abs(listing.price - price) > 0.01) {
            payload.price = price;
            needsUpdate = true;
        }

        if (needsUpdate) {
            updatesCount++;
            console.log(`Actualizando ${listing.meli_id} con stock: ${payload.available_quantity}, precio: ${payload.price}`);
            
            await fetch(`https://api.mercadolibre.com/items/${listing.meli_id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            // Pausa de 200 milisegundos para no saturar la API
            await delay(200);
        }
    }

    console.log(`Sincronización completada. ${updatesCount} publicaciones actualizadas.`);
    return new Response(JSON.stringify({ success: true, message: `Sincronización completada. ${updatesCount} publicaciones actualizadas.` }), { headers: corsHeaders });

  } catch (error) {
    console.error(`Error en stock-aggregator-and-sync: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});