// Ruta: supabase/functions/smart-process-order/index.ts
// Función mejorada para procesar órdenes con lógica de stock vs proveedor

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { order_id } = await req.json()

    if (!order_id) {
      throw new Error('order_id es requerido')
    }

    // 1. Obtener la orden completa con sus items
    const { data: order, error: orderError } = await supabase
      .from('sales_orders')
      .select(`
        *,
        order_items (
          *,
          products (
            id,
            sku,
            name,
            stock_disponible,
            supplier_id,
            suppliers (
              id,
              name
            )
          )
        )
      `)
      .eq('id', order_id)
      .single()

    if (orderError) throw orderError
    if (!order) throw new Error('Orden no encontrada')

    console.log('Procesando orden:', order.meli_order_id)

    let hasStockIssues = false
    let supplierOrders = new Map() // Para agrupar pedidos por proveedor
    let stockUpdates = []
    let orderItemUpdates = []

    // 2. Procesar cada item de la orden
    for (const item of order.order_items) {
      const product = item.products
      
      if (!product) {
        console.log(`Producto no encontrado para item: ${item.sku}`)
        hasStockIssues = true
        continue
      }

      const availableStock = product.stock_disponible || 0
      const requiredQuantity = item.quantity

      console.log(`Item ${item.sku}: Disponible=${availableStock}, Requerido=${requiredQuantity}`)

      if (availableStock >= requiredQuantity) {
        // HAY STOCK - Reservar del inventario
        console.log(`✓ Stock disponible para ${item.sku}`)
        
        stockUpdates.push({
          productId: product.id,
          newDisponible: availableStock - requiredQuantity,
          newReservado: (product.stock_reservado || 0) + requiredQuantity
        })

        orderItemUpdates.push({
          itemId: item.id,
          assigned_supplier_id: null, // Sale de nuestro stock
          source_type: 'stock_propio'
        })

      } else {
        // NO HAY STOCK - Crear pedido a proveedor
        console.log(`✗ Stock insuficiente para ${item.sku}. Creando pedido a proveedor`)
        hasStockIssues = true

        if (!product.supplier_id) {
          console.log(`⚠️ Producto ${item.sku} no tiene proveedor asignado`)
          continue
        }

        const supplierId = product.supplier_id
        const supplierName = product.suppliers?.name || 'Proveedor desconocido'

        // Agrupar por proveedor
        if (!supplierOrders.has(supplierId)) {
          supplierOrders.set(supplierId, {
            supplier_id: supplierId,
            supplier_name: supplierName,
            items: []
          })
        }

        supplierOrders.get(supplierId).items.push({
          product_id: product.id,
          sku: item.sku,
          quantity_needed: requiredQuantity,
          current_stock: availableStock,
          quantity_to_order: requiredQuantity - availableStock // Solo pedir lo que falta
        })

        orderItemUpdates.push({
          itemId: item.id,
          assigned_supplier_id: supplierId,
          source_type: 'proveedor_directo'
        })
      }
    }

    // 3. Ejecutar todas las actualizaciones en transacción
    console.log('Iniciando transacción...')

    // Actualizar stock de productos
    for (const update of stockUpdates) {
      const { error: stockError } = await supabase
        .from('products')
        .update({
          stock_disponible: update.newDisponible,
          stock_reservado: update.newReservado
        })
        .eq('id', update.productId)

      if (stockError) throw stockError
    }

    // Actualizar order_items con proveedor asignado
    for (const update of orderItemUpdates) {
      const { error: itemError } = await supabase
        .from('order_items')
        .update({
          assigned_supplier_id: update.assigned_supplier_id
        })
        .eq('id', update.itemId)

      if (itemError) throw itemError
    }

    // 4. Crear órdenes de proveedor automáticamente
    for (const [supplierId, supplierOrder] of supplierOrders) {
      console.log(`Creando orden para proveedor: ${supplierOrder.supplier_name}`)

      for (const item of supplierOrder.items) {
        const { error: supplierOrderError } = await supabase
          .from('supplier_orders')
          .insert({
            supplier_id: supplierId,
            product_id: item.product_id,
            sku: item.sku,
            quantity_to_order: item.quantity_to_order,
            current_stock: item.current_stock,
            status: 'Pendiente',
            created_by_order_id: order_id, // Rastrear qué venta generó este pedido
            notes: `Pedido automático generado por venta ${order.meli_order_id}`
          })

        if (supplierOrderError) throw supplierOrderError
      }
    }

    // 5. Actualizar estado de la orden principal
    const newOrderStatus = hasStockIssues ? 'Pendiente' : 'En Preparación'
    const sourceType = hasStockIssues ? 'mixto' : 'stock_propio'

    const { error: orderUpdateError } = await supabase
      .from('sales_orders')
      .update({
        status: newOrderStatus,
        source_type: sourceType,
        processed_at: new Date().toISOString()
      })
      .eq('id', order_id)

    if (orderUpdateError) throw orderUpdateError

    // 6. Crear registro de movimiento de inventario
    const movements = stockUpdates.map(update => ({
      product_id: update.productId,
      type: 'venta',
      quantity: -(update.newReservado - (order.order_items.find(item => item.products?.id === update.productId)?.quantity || 0)),
      description: `Venta ML ${order.meli_order_id} - Reservado para despacho`,
      reference_id: order_id,
      reference_type: 'sales_order'
    }))

    if (movements.length > 0) {
      const { error: movementError } = await supabase
        .from('inventory_movements')
        .insert(movements)

      if (movementError) {
        console.log('Error creando movimientos:', movementError)
        // No fallar por esto, solo loggear
      }
    }

    // 7. Preparar respuesta detallada
    const response = {
      success: true,
      order_id,
      meli_order_id: order.meli_order_id,
      new_status: newOrderStatus,
      source_type: sourceType,
      items_processed: order.order_items.length,
      items_from_stock: stockUpdates.length,
      items_from_suppliers: supplierOrders.size,
      supplier_orders_created: Array.from(supplierOrders.values()).map(so => ({
        supplier_name: so.supplier_name,
        items_count: so.items.length
      })),
      message: hasStockIssues 
        ? `Orden procesada. ${stockUpdates.length} items de stock, ${Array.from(supplierOrders.values()).reduce((acc, so) => acc + so.items.length, 0)} items requieren pedido a proveedor.`
        : `Orden procesada completamente desde stock propio. Lista para preparación.`
    }

    console.log('Orden procesada exitosamente:', response)

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error procesando orden:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: error.stack 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})