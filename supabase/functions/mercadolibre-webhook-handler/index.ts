// supabase/functions/mercadolibre-webhook-handler/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    console.log('Webhook de Mercado Libre recibido:', payload)

    // 1. Manejar el "challenge" de Mercado Libre para validar la URL
    if (payload.challenge) {
      return new Response(JSON.stringify({ challenge: payload.challenge }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    }
    
    // Obtenemos los datos del usuario asociado a esta notificación
    const { data: meliCredentials, error: credError } = await supabaseAdmin
        .from('meli_credentials')
        .select('user_id, access_token')
        .eq('meli_user_id', payload.user_id)
        .single();

    if (credError || !meliCredentials) {
      throw new Error(`No se encontró usuario para meli_user_id: ${payload.user_id}`);
    }

    // 2. Decidir qué hacer según el "topic" de la notificación
    if (payload.topic === 'items') {
      // --- LÓGICA PARA ACTUALIZAR PUBLICACIONES ---
      const meliId = payload.resource.split('/')[2];
      
      const itemResponse = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
        headers: { Authorization: `Bearer ${meliCredentials.access_token}` },
      });
      if (!itemResponse.ok) throw new Error(`No se pudieron obtener los detalles del item ${meliId}.`);
      const itemData = await itemResponse.json();

      await supabaseAdmin
        .from('mercadolibre_listings')
        .update({
          title: itemData.title,
          price: itemData.price,
          available_quantity: itemData.available_quantity,
          status: itemData.status,
          last_synced_at: new Date().toISOString(),
        })
        .eq('meli_id', meliId)
        .eq('user_id', meliCredentials.user_id);

      console.log(`Publicación ${meliId} actualizada exitosamente por webhook.`);

    } else if (payload.topic === 'orders_v2') {
      // --- LÓGICA PARA GUARDAR NUEVAS VENTAS ---
      const meliOrderId = payload.resource.split('/')[2];
      
      const orderResponse = await fetch(`https://api.mercadolibre.com/orders/${meliOrderId}`, {
        headers: { Authorization: `Bearer ${meliCredentials.access_token}` },
      });
      if (!orderResponse.ok) throw new Error(`No se pudieron obtener los detalles de la orden ${meliOrderId}.`);
      const orderData = await orderResponse.json();

      const { data: newOrder, error: orderError } = await supabaseAdmin
        .from('sales_orders')
        .insert({
          meli_order_id: orderData.id,
          user_id: meliCredentials.user_id,
          status: orderData.status,
          shipping_type: orderData.shipping.shipping_mode,
          total_amount: orderData.total_amount,
          buyer_name: `${orderData.buyer.first_name} ${orderData.buyer.last_name}`,
          buyer_doc: `${orderData.buyer.billing_info.doc_type} ${orderData.buyer.billing_info.doc_number}`,
          created_at: orderData.date_created,
        })
        .select()
        .single();
      
      if (orderError) throw orderError;

      const itemsToInsert = orderData.order_items.map(item => ({
        order_id: newOrder.id, sku: item.item.seller_sku, title: item.item.title,
        quantity: item.quantity, unit_price: item.unit_price, thumbnail_url: item.item.thumbnail, 
      }));

      await supabaseAdmin.from('order_items').insert(itemsToInsert);

      console.log(`Orden ${meliOrderId} y sus ${itemsToInsert.length} artículos guardados.`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })

  } catch (error) {
    console.error('Error en el webhook handler unificado de ML:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    })
  }
})