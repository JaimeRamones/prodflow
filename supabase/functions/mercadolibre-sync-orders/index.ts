// supabase/functions/mercadolibre-sync-orders/index.ts (ACTUALIZADO)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

async function getMeliToken(supabaseClient, userId) {
    const { data: creds, error } = await supabaseClient.from("meli_credentials").select("access_token, refresh_token, last_updated, user_id").eq("user_id", userId).single();
    if (error || !creds) { throw new Error("Credenciales de ML no encontradas para este usuario."); }
    const tokenAge = (new Date().getTime() - new Date(creds.last_updated).getTime()) / 1000;
    if (tokenAge < 21600) { return creds.access_token; }
    const MELI_CLIENT_ID = Deno.env.get("MELI_CLIENT_ID"); 
    const MELI_CLIENT_SECRET = Deno.env.get("MELI_CLIENT_SECRET");
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: MELI_CLIENT_ID, client_secret: MELI_CLIENT_SECRET, refresh_token: creds.refresh_token }),
    });
    if (!response.ok) { const errorBody = await response.text(); console.error("Respuesta de error de ML al refrescar token:", errorBody); throw new Error(`Error al refrescar el token de ML: ${response.statusText}`); }
    const tokenData = await response.json();
    await supabaseClient.from("meli_credentials").update({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, last_updated: new Date().toISOString() }).eq("user_id", creds.user_id);
    return tokenData.access_token;
}

serve(async (req) => {
    if (req.method === "OPTIONS") { return new Response("ok", { headers: corsHeaders }); }
    try {
        const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Usuario no autenticado.");
        const accessToken = await getMeliToken(supabase, user.id);
        const userResp = await fetch("https://api.mercadolibre.com/users/me", { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!userResp.ok) throw new Error(`No se pudo obtener el usuario de ML. Status: ${userResp.status}`);
        const meliUser = await userResp.json();
        const date = new Date();
        date.setDate(date.getDate() - 7);
        const dateFrom = date.toISOString();
        const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${meliUser.id}&order.date_created.from=${dateFrom}&sort=date_desc`;
        const ordersResp = await fetch(ordersUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!ordersResp.ok) throw new Error(`Error al buscar órdenes en ML. Status: ${ordersResp.status}`);
        const { results: summarizedOrders } = await ordersResp.json();
        if (summarizedOrders.length === 0) {
            return new Response(JSON.stringify({ message: "No hay ventas nuevas para sincronizar." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        let processedCount = 0;
        for (const summaryOrder of summarizedOrders) {
            const detailUrl = `https://api.mercadolibre.com/orders/${summaryOrder.id}`;
            const detailResp = await fetch(detailUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!detailResp.ok) { console.warn(`No se pudieron obtener detalles para la orden ${summaryOrder.id}, se omitirá.`); continue; }
            const order = await detailResp.json();
            
            const payment = order.payments?.[0] || {};
            const shippingCost = payment.shipping_cost ?? 0;
            const saleFee = order.order_items?.reduce((acc, item) => acc + (item.sale_fee || 0), 0) ?? 0;
            const taxesAmount = payment.taxes_amount ?? 0;
            const totalAmount = order.total_amount ?? 0;
            // El neto es lo que ML te paga, ya descontando sus cargos.
            const netReceivedAmount = totalAmount - saleFee;
            
            const saleOrderData = {
                meli_order_id: order.id,
                user_id: user.id,
                buyer_name: `${order.buyer.first_name || ''} ${order.buyer.last_name || ''}`.trim() || order.buyer.nickname,
                total_amount: totalAmount,
                shipping_id: order.shipping?.id,
                shipping_type: order.shipping?.logistic_type === 'flex' ? 'flex' : 'mercado_envios',
                status: 'Recibido',
                created_at: order.date_created,
                shipping_cost: shippingCost,
                sale_fee: saleFee,
                taxes_amount: taxesAmount,
                net_received_amount: netReceivedAmount,
            };
            const { data: savedOrder, error: orderError } = await supabase.from('sales_orders').upsert(saleOrderData, { onConflict: 'meli_order_id' }).select().single();
            if (orderError) throw orderError;
            
            const orderItems = order.order_items.map(item => ({
                order_id: savedOrder.id,
                meli_item_id: item.item.id,
                sku: item.item.seller_sku,
                title: item.item.title,
                quantity: item.quantity,
                unit_price: item.unit_price,
                thumbnail_url: item.item.thumbnail,
            }));
            const { error: itemsError } = await supabase.from('order_items').upsert(orderItems, { onConflict: 'order_id, sku' });
            if (itemsError) throw itemsError;
            processedCount++;
        }
        return new Response(JSON.stringify({ message: `Sincronización completada. Se procesaron ${processedCount} ventas.` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error) {
        console.error("Error en la función 'mercadolibre-sync-orders':", error);
        return new Response(JSON.stringify({ error: `Error interno en la función: ${error.message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});