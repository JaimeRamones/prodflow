// supabase/functions/mercadolibre-sync-orders/index.ts
// VERSIÓN FINAL DE PRODUCCIÓN

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

async function getMeliToken(supabaseClient, userId) {
  const { data: creds, error } = await supabaseClient
    .from("meli_credentials")
    .select("access_token, refresh_token, last_updated, user_id")
    .eq("user_id", userId)
    .single();

  if (error || !creds) {
    throw new Error("Credenciales de ML no encontradas para este usuario.");
  }

  const tokenAge = (new Date().getTime() - new Date(creds.last_updated).getTime()) / 1000;
  if (tokenAge < 21600) {
    return creds.access_token;
  }

  const MELI_CLIENT_ID = Deno.env.get("MELI_CLIENT_ID"); 
  const MELI_CLIENT_SECRET = Deno.env.get("MELI_CLIENT_SECRET");

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: MELI_CLIENT_ID,
      client_secret: MELI_CLIENT_SECRET,
      refresh_token: creds.refresh_token,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Respuesta de error de ML al refrescar token:", errorBody);
    throw new Error(`Error al refrescar el token de ML: ${response.statusText}`);
  }

  const tokenData = await response.json();

  await supabaseClient
    .from("meli_credentials")
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      last_updated: new Date().toISOString(),
    })
    .eq("user_id", creds.user_id);

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    const accessToken = await getMeliToken(supabase, user.id);

    const userResp = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userResp.ok) throw new Error(`No se pudo obtener el usuario de ML. Status: ${userResp.status}`);
    const meliUser = await userResp.json();

    const date = new Date();
    date.setDate(date.getDate() - 7);
    const dateFrom = date.toISOString();

    const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${meliUser.id}&order.date_created.from=${dateFrom}`;
    const ordersResp = await fetch(ordersUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!ordersResp.ok) throw new Error(`Error al buscar órdenes en ML. Status: ${ordersResp.status}`);

    const { results: orders } = await ordersResp.json();

    if (orders.length === 0) {
      return new Response(JSON.stringify({ message: "No hay ventas nuevas para sincronizar." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const order of orders) {
      let shippingType = order.shipping?.logistic_type === 'flex' ? 'flex' : 'mercado_envios';

      const saleOrderData = {
        meli_order_id: order.id,
        user_id: user.id,
        buyer_name: order.buyer.nickname,
        total_amount: order.total_amount,
        shipping_id: order.shipping?.id,
        shipping_type: shippingType,
        status: 'Pendiente',
        created_at: order.date_created,
      };

      const { data: savedOrder, error: orderError } = await supabase
        .from('sales_orders')
        .upsert(saleOrderData, { onConflict: 'meli_order_id' })
        .select()
        .single();
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

      const { error: itemsError } = await supabase
        .from('order_items')
        .upsert(orderItems, { onConflict: 'order_id, sku' });
      if (itemsError) throw itemsError;
    }

    return new Response(JSON.stringify({ message: `Sincronización completada. Se procesaron ${orders.length} ventas.` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error en la función 'mercadolibre-sync-orders':", error);
    return new Response(JSON.stringify({ error: `Error interno en la función: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});