// supabase/functions/mercadolibre-webhook/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// Usamos la clave de Service Role para autenticar el Broadcast y las operaciones de DB
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
    const isFlex = (order.tags && order.tags.includes('mshops_flex')) || order.shipping?.logistic_type === 'self_service';
    const shippingType = (shippingId && isFlex) ? 'flex' : 'mercado_envios';
    
    let internalStatus = 'Recibido';
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

    const orderItemsData = order.order_items.map((item: any) => ({
        sales_order_id: savedOrder.id,
        meli_item_id: item.item.id,
        title: item.item.title,
        sku: item.item.seller_sku || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        thumbnail_url: item.item.picture_url || null,
    }));

    await supabaseAdmin.from('order_items').delete().eq('sales_order_id', savedOrder.id);
    await supabaseAdmin.from('order_items').insert(orderItemsData);
}


serve(async (req) => {
  if (req.method !== 'POST') return new Response("Method not allowed", { status: 405 });

  try {
    const notification = await req.json();
    
    if (notification.topic !== 'orders_v2') {
        return new Response("Ignored", { status: 200 });
    }

    // 1. Identificar al usuario
    const meliSellerId = notification.user_id; 
    // Inicializamos cliente Admin (con Service Role Key)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userMapping } = await supabaseAdmin
        .from('meli_credentials')
        .select('user_id')
        .eq('meli_user_id', meliSellerId)
        .single();

    if (!userMapping) throw new Error(`Seller ID ${meliSellerId} no encontrado.`);
    const supabaseUserId = userMapping.user_id;

    // 2. Obtener Access Token
    const accessToken = await getMeliToken(supabaseAdmin, supabaseUserId);

    // 3. Obtener detalles de la orden
    const orderId = notification.resource.split('/').pop();
    const orderResponse = await fetch(`https://api.mercadolibre.com/orders/${orderId}?include=shipments`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!orderResponse.ok) throw new Error(`Fallo al obtener orden ${orderId}.`);
    const orderData = await orderResponse.json();

    // 4. Procesar y Guardar la orden
    await processOrder(orderData, supabaseUserId, supabaseAdmin);

    // --- 5. NUEVO: Enviar señal de Broadcast ---
    try {
        // Creamos un canal específico para el usuario: "user_updates:UUID_DEL_USUARIO"
        const channelName = `user_updates:${supabaseUserId}`;
        const channel = supabaseAdmin.channel(channelName);
        
        // Enviamos la señal. El frontend escuchará el evento 'sales_update'.
        await channel.send({
          type: 'broadcast',
          event: 'sales_update', 
          payload: { source: 'webhook', orderId: orderId },
        });
        console.log(`Broadcast enviado a ${channelName}`);

    } catch (broadcastError) {
        // El error de broadcast no debe detener la respuesta a ML
        console.error("Error al enviar Broadcast (no crítico):", broadcastError);
    }
    // --------------------------------------

    console.log(`Orden ${orderId} recibida y guardada (Webhook).`);
    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error("Error en el webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
})