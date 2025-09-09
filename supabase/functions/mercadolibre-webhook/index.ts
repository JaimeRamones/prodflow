// supabase/functions/mercadolibre-webhook/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// Usamos la clave configurada en el Paso 2.1
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Función auxiliar para obtener el token (Adaptada para usar cliente Admin)
async function getMeliToken(supabaseAdmin: any, userId: string) {
  const { data: creds, error } = await supabaseAdmin.from("meli_credentials")
    .select("access_token, refresh_token, last_updated")
    .eq("user_id", userId)
    .single();
  
  if (error || !creds) throw new Error(`Credenciales no encontradas para user ${userId}.`);

  const tokenAge = (new Date().getTime() - new Date(creds.last_updated).getTime()) / 1000;
  if (tokenAge < 21000) return creds.access_token;

  console.log("Refrescando token (Webhook)...");
  const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID');
  const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET');

  const params = new URLSearchParams({ grant_type: "refresh_token", client_id: MELI_CLIENT_ID, client_secret: MELI_CLIENT_SECRET, refresh_token: creds.refresh_token });

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) throw new Error("Error al refrescar token de ML.");
  
  const tokenData = await response.json();
  await supabaseAdmin.from("meli_credentials").update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    last_updated: new Date().toISOString()
  }).eq("user_id", userId);
  
  return tokenData.access_token;
}

// Función para guardar la orden en Supabase (UPSERT)
async function processOrder(order: any, supabaseUserId: string, supabaseAdmin: any) {
    const shippingId = order.shipping?.id;
    // Detectar Flex (Ajusta si tu lógica es diferente)
    const isFlex = (order.tags && order.tags.includes('mshops_flex')) || order.shipping?.logistic_type === 'self_service';
    const shippingType = (shippingId && isFlex) ? 'flex' : 'mercado_envios';
    
    let internalStatus = 'Recibido'; // Estado inicial
    if (order.status === 'cancelled') {
        internalStatus = 'Cancelado';
    }

    const saleOrderData = {
        user_id: supabaseUserId,
        meli_order_id: order.id,
        total_amount: order.total_amount,
        currency_id: order.currency_id,
        buyer_name: `${order.buyer.first_name} ${order.buyer.last_name}`.trim(),
        shipping_id: shippingId,
        shipping_type: shippingType,
        status: internalStatus,
        created_at: order.date_created,
        // Guardamos estado de envío de ML para filtros de impresión
        shipping_status: order.shipping?.status || null,
        shipping_substatus: order.shipping?.substatus || null,
    };

    // Insertar o actualizar (Upsert)
    const { data: savedOrder, error: orderError } = await supabaseAdmin
        .from('sales_orders')
        .upsert(saleOrderData, { onConflict: 'meli_order_id, user_id' })
        .select('id')
        .single();

    if (orderError) throw new Error(`Error guardando orden: ${orderError.message}`);

    // Preparar y guardar items
    const orderItemsData = order.order_items.map((item: any) => ({
        sales_order_id: savedOrder.id,
        meli_item_id: item.item.id,
        title: item.item.title,
        sku: item.item.seller_sku || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        // Guardamos la imagen también
        thumbnail_url: item.item.picture_url || null,
    }));

    // Limpiamos items antiguos y añadimos los nuevos (para manejar cambios en la orden)
    await supabaseAdmin.from('order_items').delete().eq('sales_order_id', savedOrder.id);
    await supabaseAdmin.from('order_items').insert(orderItemsData);
}


serve(async (req) => {
  if (req.method !== 'POST') return new Response("Method not allowed", { status: 405 });

  try {
    const notification = await req.json();
    
    // Solo nos interesan las órdenes
    if (notification.topic !== 'orders_v2' || !notification.resource) {
        return new Response("Ignored", { status: 200 });
    }

    // 1. Identificar al usuario
    const meliSellerId = notification.user_id; 
    // Inicializamos cliente Admin (con Service Role Key)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscamos el usuario de Supabase correspondiente
    const { data: userMapping } = await supabaseAdmin
        .from('meli_credentials')
        .select('user_id')
        .eq('meli_user_id', meliSellerId)
        .single();

    if (!userMapping) throw new Error(`Seller ID ${meliSellerId} no encontrado.`);
    const supabaseUserId = userMapping.user_id;

    // 2. Obtener Access Token
    const accessToken = await getMeliToken(supabaseAdmin, supabaseUserId);

    // 3. Obtener detalles de la orden de ML
    const orderId = notification.resource.split('/').pop();
    // Incluimos shipments para el estado de la etiqueta
    const orderResponse = await fetch(`https://api.mercadolibre.com/orders/${orderId}?include=shipments`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!orderResponse.ok) throw new Error(`Fallo al obtener orden ${orderId}.`);
    const orderData = await orderResponse.json();

    // 4. Procesar y Guardar la orden
    await processOrder(orderData, supabaseUserId, supabaseAdmin);

    console.log(`Orden ${orderId} recibida y guardada (Webhook).`);
    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("Error en el webhook:", error);
    // Respondemos 500 para que ML reintente
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
})