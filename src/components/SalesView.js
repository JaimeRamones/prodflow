// supabase/functions/mercadolibre-sync-orders/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

// La función getMeliToken no cambia, la dejamos como está.
async function getMeliToken(supabaseClient, userId) {
  const { data: creds, error } = await supabaseClient
    .from("meli_credentials")
    .select("access_token, refresh_token, last_updated, user_id")
    .eq("user_id", userId) // Aseguramos que sean las credenciales del usuario correcto
    .single();

  if (error || !creds) {
    console.error("Error al buscar credenciales de ML:", error);
    throw new Error("Credenciales de ML no encontradas para este usuario.");
  }

  const tokenAge = (new Date() - new Date(creds.last_updated)) / 1000;
  if (tokenAge < 21600) {
    console.log("[DIAGNÓSTICO] Token de ML es válido. Usando token existente.");
    return creds.access_token;
  }
  
  console.log("[DIAGNÓSTICO] Token de ML expirado. Refrescando...");
  const MELI_CLIENT_ID = Deno.env.get("REACT_APP_MELI_CLIENT_ID");
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
    
  console.log("[DIAGNÓSTICO] Token de ML refrescado y guardado exitosamente.");
  return tokenData.access_token;
}

serve(async (req) => {
  console.log("--------------------------------------------------");
  console.log("Iniciando la función mercadolibre-sync-orders...");

  if (req.method === "OPTIONS") {
    console.log("Respondiendo a petición OPTIONS (preflight).");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Paso 1: Creando cliente de Supabase...");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );
    console.log("Cliente de Supabase creado exitosamente.");

    console.log("Paso 2: Obteniendo usuario autenticado...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado. El token JWT podría ser inválido o haber expirado.");
    console.log(`Usuario autenticado: ${user.id} (${user.email})`);

    console.log("Paso 3: Obteniendo token de acceso de Mercado Libre...");
    const accessToken = await getMeliToken(supabase, user.id);
    console.log("Token de ML obtenido exitosamente.");

    console.log("Paso 4: Obteniendo ID de vendedor de Mercado Libre...");
    const userResp = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userResp.ok) throw new Error(`No se pudo obtener el usuario de ML. Status: ${userResp.status}`);
    const meliUser = await userResp.json();
    console.log(`ID de Vendedor de ML: ${meliUser.id}`);

    console.log("Paso 5: Buscando órdenes en la API de ML de los últimos 7 días...");
    const date = new Date();
    date.setDate(date.getDate() - 7);
    const dateFrom = date.toISOString();

    const ordersUrl = `https://api.mercadolibre.com/orders/search?seller=${meliUser.id}&order.date_created.from=${dateFrom}`;
    console.log(`URL de consulta de órdenes: ${ordersUrl}`);
    
    const ordersResp = await fetch(ordersUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!ordersResp.ok) throw new Error(`Error al buscar órdenes en ML. Status: ${ordersResp.status}`);
    
    const { results: orders } = await ordersResp.json();
    console.log(`Se encontraron ${orders.length} órdenes.`);

    if (orders.length === 0) {
      return new Response(JSON.stringify({ message: "No hay ventas nuevas para sincronizar." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Paso 6: Procesando y guardando cada orden en la base de datos...");
    for (const [index, order] of orders.entries()) {
      console.log(`Procesando orden ${index + 1}/${orders.length} (ID: ${order.id})...`);
      
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
      
      if (orderError) {
        console.error("Error al guardar la orden:", orderError);
        throw orderError; // Detiene la ejecución si una orden falla
      }

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

      if (itemsError) {
        console.error("Error al guardar los items de la orden:", itemsError);
        throw itemsError; // Detiene la ejecución
      }
    }
    console.log("Todas las órdenes fueron procesadas exitosamente.");

    return new Response(JSON.stringify({ message: `Sincronización completada. Se procesaron ${orders.length} ventas.` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("----------- ERROR FATAL EN LA FUNCIÓN -----------");
    console.error("Mensaje de Error:", error.message);
    console.error("Stack Trace:", error.stack);
    console.error("-------------------------------------------------");
    return new Response(JSON.stringify({ error: `Error interno en la función: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});