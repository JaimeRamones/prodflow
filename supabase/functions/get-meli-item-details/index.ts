// FUNCIÓN 1: supabase/functions/get-meli-item-details/index.ts
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
    const { item_id } = await req.json()
    
    if (!item_id) {
      return new Response(
        JSON.stringify({ error: 'item_id es requerido' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Obtener el access_token del usuario desde la base de datos
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseClient.auth.getUser(token)

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Usuario no autenticado' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Obtener el access_token de MercadoLibre del usuario usando tu tabla existente
    const { data: userData, error: userError } = await supabaseClient
      .from('meli_credentials')
      .select('access_token')
      .eq('user_id', user.id)
      .single()

    if (userError || !userData?.access_token) {
      return new Response(
        JSON.stringify({ error: 'Token de MercadoLibre no encontrado' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Llamar a la API de MercadoLibre para obtener detalles del item
    const meliResponse = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
      headers: {
        'Authorization': `Bearer ${userData.access_token}`
      }
    })

    if (!meliResponse.ok) {
      throw new Error(`Error de MercadoLibre: ${meliResponse.status}`)
    }

    const itemData = await meliResponse.json()

    return new Response(
      JSON.stringify({
        id: itemData.id,
        title: itemData.title,
        pictures: itemData.pictures || [],
        thumbnail: itemData.thumbnail,
        secure_thumbnail: itemData.secure_thumbnail
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

// ================================================================================

// FUNCIÓN 2: supabase/functions/get-meli-shipment-details/index.ts
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
    const { shipment_id } = await req.json()
    
    if (!shipment_id) {
      return new Response(
        JSON.stringify({ error: 'shipment_id es requerido' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Obtener el access_token del usuario desde la base de datos
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseClient.auth.getUser(token)

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Usuario no autenticado' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Obtener el access_token de MercadoLibre del usuario usando tu tabla existente
    const { data: userData, error: userError } = await supabaseClient
      .from('meli_credentials')
      .select('access_token')
      .eq('user_id', user.id)
      .single()

    if (userError || !userData?.access_token) {
      return new Response(
        JSON.stringify({ error: 'Token de MercadoLibre no encontrado' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Llamar a la API de MercadoLibre para obtener detalles del envío
    const meliResponse = await fetch(`https://api.mercadolibre.com/shipments/${shipment_id}`, {
      headers: {
        'Authorization': `Bearer ${userData.access_token}`,
        'x-format-new': 'true'
      }
    })

    if (!meliResponse.ok) {
      throw new Error(`Error de MercadoLibre: ${meliResponse.status}`)
    }

    const shipmentData = await meliResponse.json()

    // Extraer información relevante del envío según la documentación de ML
    return new Response(
      JSON.stringify({
        id: shipmentData.id,
        cost: shipmentData.cost || 0,
        base_cost: shipmentData.base_cost || 0,
        status: shipmentData.status,
        substatus: shipmentData.substatus,
        tracking_number: shipmentData.tracking_number,
        tracking_method: shipmentData.tracking_method,
        service_id: shipmentData.service_id,
        sender_address: shipmentData.sender_address,
        receiver_address: shipmentData.receiver_address,
        shipping_items: shipmentData.shipping_items,
        lead_time: shipmentData.lead_time || { cost: 0 }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})