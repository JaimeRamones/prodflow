// supabase/functions/get-ml-labels/index.ts
// VERSIÓN CORREGIDA: Sintaxis válida para Supabase

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

// Función para obtener información de origen de los envíos
async function getShipmentOrigins(supabaseClient, shipmentIds, userId) {
  const shipmentArray = shipmentIds.split(',').map(id => id.trim());
  const origins = {};
  
  try {
    console.log('Consultando orígenes para shipments:', shipmentArray);
    
    const { data: salesOrders, error } = await supabaseClient
      .from('sales_orders')
      .select(`
        shipping_id,
        source_type,
        order_items (
          assigned_supplier_id,
          sku,
          title
        )
      `)
      .eq('user_id', userId)
      .in('shipping_id', shipmentArray);

    if (error) {
      console.error('Error consultando origen de envíos:', error);
      shipmentArray.forEach(id => {
        origins[id] = { type: 'stock', label: 'STOCK PROPIO' };
      });
      return origins;
    }

    shipmentArray.forEach(shipmentId => {
      const order = salesOrders?.find(o => o.shipping_id?.toString() === shipmentId);
      
      if (!order) {
        origins[shipmentId] = { type: 'stock', label: 'STOCK PROPIO' };
        return;
      }

      const hasSupplierItems = order.order_items?.some(item => item.assigned_supplier_id);
      const hasStockItems = order.order_items?.some(item => !item.assigned_supplier_id);

      if (hasSupplierItems && hasStockItems) {
        origins[shipmentId] = { type: 'mixed', label: 'MIXTO' };
      } else if (hasSupplierItems) {
        origins[shipmentId] = { type: 'supplier', label: 'PROVEEDOR' };
      } else {
        origins[shipmentId] = { type: 'stock', label: 'STOCK PROPIO' };
      }
    });

    console.log('Orígenes determinados:', origins);
    return origins;
    
  } catch (error) {
    console.error('Error en getShipmentOrigins:', error);
    shipmentArray.forEach(id => {
      origins[id] = { type: 'stock', label: 'STOCK PROPIO' };
    });
    return origins;
  }
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

    const { shipment_ids, format } = await req.json();
    if (!shipment_ids || !format) throw new Error("Faltan parámetros.");

    console.log(`=== INICIO PROCESAMIENTO ===`);
    console.log(`Shipments: ${shipment_ids}`);
    console.log(`Format: ${format}`);
    console.log(`User ID: ${user.id}`);

    // PASO 1: Obtener información de origen
    console.log('=== PASO 1: Consultando orígenes ===');
    const origins = await getShipmentOrigins(supabase, shipment_ids, user.id);

    // PASO 2: Obtener etiquetas de MercadoLibre
    console.log('=== PASO 2: Obteniendo etiquetas de ML ===');
    const accessToken = await getMeliToken(supabase, user.id);
    const url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipment_ids}&response_type=${format === 'pdf' ? 'pdf' : 'zpl2'}`;
    console.log('URL ML:', url);

    const meliResponse = await fetch(url, { 
      headers: { Authorization: `Bearer ${accessToken}` } 
    });

    const contentType = meliResponse.headers.get("content-type");
    console.log('Content-Type de ML:', contentType);

    if (contentType && contentType.includes("application/json")) {
        const errorJson = await meliResponse.json();
        throw new Error(`Error de la API de ML: ${errorJson.message || JSON.stringify(errorJson)}`);
    }
    if (!meliResponse.ok) {
        const errorText = await meliResponse.text();
        throw new Error(`Error de la API de ML (Status ${meliResponse.status}): ${errorText}`);
    }

    // PASO 3: Por ahora, devolver las etiquetas originales con información de origen
    console.log('=== PASO 3: Retornando etiquetas originales (con información de origen) ===');
    console.log('Información de orígenes capturada:', origins);
    
    // Contar los tipos de origen para debugging
    const originCounts = Object.values(origins).reduce((acc, origin) => {
      acc[origin.type] = (acc[origin.type] || 0) + 1;
      return acc;
    }, {});
    console.log('Distribución de orígenes:', originCounts);
    
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set('Content-Type', meliResponse.headers.get('Content-Type') || 'text/plain');
    
    if (meliResponse.headers.get('Content-Encoding')) {
      responseHeaders.set('Content-Encoding', meliResponse.headers.get('Content-Encoding'));
    }

    // Agregar información de origen detallada en headers
    responseHeaders.set('X-Origin-Info', JSON.stringify(origins));
    responseHeaders.set('X-Origin-Summary', JSON.stringify(originCounts));
    responseHeaders.set('X-Processing-Status', 'origins-captured-zip-not-processed');

    console.log('=== RESPUESTA ENVIADA (con información de origen capturada) ===');
    
    return new Response(meliResponse.body, {
        status: 200,
        headers: responseHeaders
    });

  } catch (error) {
    console.error("=== ERROR EN FUNCIÓN ===", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString(),
        function: 'get-ml-labels-v2'
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});