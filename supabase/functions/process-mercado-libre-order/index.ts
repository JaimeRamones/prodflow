// supabase/functions/process-mercado-libre-order/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: corsHeaders }); }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    const { order_id } = await req.json();
    if (!order_id) throw new Error("No se proporcionó un ID de orden.");

    // 1. Obtener la orden y sus items
    const { data: saleOrder, error: orderError } = await supabase
      .from('sales_orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single();

    if (orderError) throw new Error(`No se pudo encontrar la orden: ${orderError.message}`);
    if (saleOrder.status !== 'Recibido') throw new Error('Esta orden ya ha sido procesada.');

    // 2. Revisar cada item para ver si se necesita pedir a proveedor
    for (const item of saleOrder.order_items) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, stock_disponible')
        .eq('sku', item.sku)
        .single();

      // Si el producto no existe o no tiene stock suficiente
      if (!product || product.stock_disponible < item.quantity) {
        const supplierOrder = {
          sku: item.sku,
          quantity_to_order: item.quantity,
          sale_type: saleOrder.shipping_type,
          status: 'Pendiente', // Estado inicial para el pedido a proveedor
        };
        const { error: supplierOrderError } = await supabase.from('supplier_orders').insert(supplierOrder);
        if (supplierOrderError) throw new Error(`Error al crear pedido a proveedor para ${item.sku}: ${supplierOrderError.message}`);
      }
    }

    // 3. Actualizar el estado de la orden principal a 'Pendiente'
    // Esto la hará visible en la "Gestión de Pedidos"
    const { error: updateError } = await supabase
      .from('sales_orders')
      .update({ status: 'Pendiente' })
      .eq('id', order_id);

    if (updateError) throw new Error(`Error al actualizar la orden a pendiente: ${updateError.message}`);

    return new Response(JSON.stringify({ message: `Orden #${saleOrder.meli_order_id} procesada exitosamente.` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error en la función 'process-mercado-libre-order':", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});