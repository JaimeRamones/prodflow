// supabase/functions/mercadolibre-webhook-handler/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    console.log('Webhook de Orden de ML recibido:', JSON.stringify(payload, null, 2));

    if (payload.challenge) {
      return new Response(JSON.stringify({ challenge: payload.challenge }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }
    
    if (payload.topic === 'orders_v2') {
      const meliOrderId = payload.resource.split('/')[2];
      
      const { data: meliCredentials } = await supabaseAdmin
        .from('meli_credentials')
        .select('user_id, access_token')
        .eq('meli_user_id', payload.user_id)
        .single();

      if (!meliCredentials) {
        throw new Error(`No se encontró usuario para meli_user_id: ${payload.user_id}`);
      }

      const orderResponse = await fetch(`https://api.mercadolibre.com/orders/${meliOrderId}`, {
        headers: { Authorization: `Bearer ${meliCredentials.access_token}` },
      });

      if (!orderResponse.ok) {
        throw new Error(`No se pudieron obtener los detalles de la orden ${meliOrderId} de ML.`);
      }
      const orderData = await orderResponse.json();

      const { data: newOrder, error: orderError } = await supabaseAdmin
        .from('sales_orders')
        .insert({
          meli_order_id: orderData.id,
          user_id: meliCredentials.user_id,
          status: 'Pendiente', // Asignamos un estado inicial
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
        order_id: newOrder.id,
        sku: item.item.seller_sku,
        title: item.item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        thumbnail_url: item.item.thumbnail, 
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('order_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      console.log(`Orden ${meliOrderId} y sus ${itemsToInsert.length} artículos guardados. Procediendo a la gestión de stock...`);
      
      // --- ¡AQUÍ EMPIEZA LA NUEVA "INTELIGENCIA" DE STOCK! ---
      for (const item of orderData.order_items) {
        const soldSku = item.item.seller_sku;
        const soldQuantity = item.quantity;
        
        // Buscamos el producto en nuestro inventario
        const { data: product } = await supabaseAdmin
            .from('products')
            .select('id, stock_disponible, stock_reservado')
            .eq('sku', soldSku)
            .single();

        if (product && product.stock_disponible >= soldQuantity) {
            // CASO 1: El producto existe y hay stock suficiente
            const newStockDisponible = product.stock_disponible - soldQuantity;
            const newStockReservado = (product.stock_reservado || 0) + soldQuantity;
            
            const { error: stockUpdateError } = await supabaseAdmin
                .from('products')
                .update({ 
                    stock_disponible: newStockDisponible,
                    stock_reservado: newStockReservado
                })
                .eq('id', product.id);

            if (stockUpdateError) {
                console.error(`Error al actualizar stock para SKU ${soldSku}:`, stockUpdateError.message);
            } else {
                console.log(`Stock para SKU ${soldSku} actualizado y reservado exitosamente.`);
            }

        } else {
            // CASO 2: El producto no existe o no hay stock suficiente
            console.log(`No hay stock suficiente para SKU ${soldSku}. Creando pedido a proveedor.`);
            
            const { error: supplierOrderError } = await supabaseAdmin
                .from('supplier_orders')
                .insert({
                    user_id: meliCredentials.user_id,
                    sku: soldSku,
                    quantity: soldQuantity,
                    status: 'Pendiente',
                    sale_type: orderData.shipping.shipping_mode,
                    related_sale_id: newOrder.id,
                });

            if (supplierOrderError) {
                console.error(`Error al crear pedido a proveedor para SKU ${soldSku}:`, supplierOrderError.message);
            } else {
                console.log(`Pedido a proveedor para SKU ${soldSku} creado exitosamente.`);
            }
        }
      }
    }

    // El resto de los topics (como 'items') se mantiene igual
    // ...

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error en el webhook handler de ML:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})