// supabase/functions/mercadolibre-sync-orders/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

// Función para obtener un token de acceso válido de Mercado Libre
async function getMeliToken(supabaseClient) {
  const { data: creds, error } = await supabaseClient
    .from("meli_credentials")
    .select("access_token, refresh_token, last_updated")
    .single();

  if (error || !creds) throw new Error("Credenciales de ML no encontradas.");

  const tokenAge = (new Date() - new Date(creds.last_updated)) / 1000;
  if (tokenAge < 21600) { // Menos de 6 horas, el token es válido
    return creds.access_token;
  }

  // Si el token expiró, hay que refrescarlo
  const MELI_CLIENT_ID = Deno.env.get("REACT_APP_MELI_CLIENT_ID");
  const MELI_CLIENT_SECRET = Deno.env.get("MELI_CLIENT_SECRET");

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: MELI_CLIENT_ID,
      client_secret: MELI_CLIENT_SECRET,
      refresh_token: creds.refresh_token,
    }),
  });

  if (!response.ok) throw new Error("Error al refrescar el token de ML.");
  
  const tokenData = await response.json();
  
  // Actualiza las credenciales en la base de datos
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

    const accessToken = await getMeliToken(supabase);
    
    // 1. Obtener el User ID de Mercado Libre
    const userResp = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userResp.ok) throw new Error("No se pudo obtener el usuario de ML.");
    const meliUser = await userResp.json();

    // 2. Buscar órdenes de los últimos 7 días
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const dateFrom = date.toISOString();

    const ordersResp = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${meliUser.id}&order.date_created.from=${dateFrom}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!ordersResp.ok) throw new Error("Error al buscar órdenes en ML.");
    const { results: orders } = await ordersResp.json();

    if (orders.length === 0) {
      return new Response(JSON.stringify({ message: "No hay ventas nuevas para sincronizar." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Procesar y guardar cada orden
    for (const order of orders) {
      // Información del envío
      let shippingType = 'mercado_envios';
      if (order.shipping && order.shipping.shipping_mode === 'me1') {
          shippingType = 'flex';
      }

      const saleOrderData = {
        meli_order_id: order.id,
        user_id: user.id,
        buyer_name: order.buyer.nickname,
        total_amount: order.total_amount,
        shipping_id: order.shipping?.id,
        shipping_type: shippingType,
        status: 'Pendiente', // Estado inicial
        created_at: order.date_created,
      };

      const { data: savedOrder, error: orderError } = await supabase
        .from('sales_orders')
        .upsert(saleOrderData, { onConflict: 'meli_order_id' })
        .select()
        .single();
      
      if (orderError) throw orderError;

      // Procesar los items de la orden
      const orderItems = order.order_items.map(item => ({
        order_id: savedOrder.id,
        meli_item_id: item.item.id,
        sku: item.item.seller_sku,
        title: item.item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        thumbnail_url: item.item.thumbnail, // Guardamos la URL de la imagen
      }));
      
      const { error: itemsError } = await supabase
        .from('order_items')
        .upsert(orderItems, { onConflict: 'order_id, sku' }); // Evita duplicados por si se re-sincroniza

      if (itemsError) throw itemsError;
    }

    return new Response(JSON.stringify({ message: `Sincronización completada. Se procesaron ${orders.length} ventas.` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});