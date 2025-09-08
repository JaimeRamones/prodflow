// supabase/functions/get-ml-labels/index.ts
// VERSIÓN FINAL: Solo recolecta y devuelve datos en formato JSON.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

async function getMeliToken(supabaseClient, userId) {
  const { data: creds } = await supabaseClient.from("meli_credentials").select("access_token, refresh_token, last_updated").eq("user_id", userId).single();
  if (!creds) throw new Error("Credenciales no encontradas.");
  const tokenAge = (new Date().getTime() - new Date(creds.last_updated).getTime()) / 1000;
  if (tokenAge < 21600) return creds.access_token;
  const MELI_CLIENT_ID = Deno.env.get("MELI_CLIENT_ID");
  const MELI_CLIENT_SECRET = Deno.env.get("MELI_CLIENT_SECRET");
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: MELI_CLIENT_ID, client_secret: MELI_CLIENT_SECRET, refresh_token: creds.refresh_token }),
  });
  if (!response.ok) throw new Error("Error al refrescar token de ML.");
  const tokenData = await response.json();
  await supabaseClient.from("meli_credentials").update({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, last_updated: new Date().toISOString() }).eq("user_id", userId);
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: corsHeaders }); }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");
    
    const { order_id } = await req.json();
    if (!order_id) throw new Error("Falta el parámetro: order_id.");

    // 1. Obtener datos de nuestra base de datos
    const { data: orderData, error: orderError } = await supabase.from('sales_orders').select('*, order_items(*)').eq('id', order_id).single();
    if (orderError) throw orderError;

    // 2. Obtener datos del envío desde la API de Mercado Libre
    const accessToken = await getMeliToken(supabase, user.id);
    const shippingResp = await fetch(`https://api.mercadolibre.com/shipments/${orderData.shipping_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!shippingResp.ok) throw new Error("No se pudieron obtener los datos de envío de ML.");
    const shippingData = await shippingResp.json();

    // 3. Verificar el stock de cada item
    const itemsWithStockInfo = await Promise.all(orderData.order_items.map(async (item) => {
      const { data: product } = await supabase.from('products').select('stock_disponible').eq('sku', item.sku).single();
      return {
        ...item,
        has_stock: product && product.stock_disponible >= item.quantity,
      };
    }));

    // 4. Devolver todos los datos necesarios como un solo objeto JSON
    const labelData = {
      order: orderData,
      shipping: shippingData,
      items: itemsWithStockInfo,
    };

    return new Response(JSON.stringify(labelData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Error en get-ml-labels (data provider):", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});