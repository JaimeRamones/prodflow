// supabase/functions/get-ml-labels/index.ts
// VERSIÓN DE DIAGNÓSTICO CON LOGS PASO A PASO

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders } from "../_shared/cors.ts";

async function getMeliToken(supabaseClient, userId) {
  console.log("Paso A: Entrando a getMeliToken...");
  const { data: creds, error } = await supabaseClient.from("meli_credentials").select("access_token, refresh_token, last_updated").eq("user_id", userId).single();
  if (error) { console.error("Error en getMeliToken al buscar creds:", error); throw error; }
  if (!creds) throw new Error("Credenciales no encontradas.");
  
  const tokenAge = (new Date().getTime() - new Date(creds.last_updated).getTime()) / 1000;
  if (tokenAge < 21600) {
    console.log("Paso B: Token de ML válido encontrado.");
    return creds.access_token;
  }
  
  console.log("Paso C: Token de ML expirado, iniciando refresco.");
  const MELI_CLIENT_ID = Deno.env.get("MELI_CLIENT_ID");
  const MELI_CLIENT_SECRET = Deno.env.get("MELI_CLIENT_SECRET");
  if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET) {
      throw new Error("Los secrets MELI_CLIENT_ID o MELI_CLIENT_SECRET no están configurados.");
  }

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: MELI_CLIENT_ID, client_secret: MELI_CLIENT_SECRET, refresh_token: creds.refresh_token }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error("Error en la respuesta de ML al refrescar token:", errBody);
    throw new Error("Error al refrescar token de ML.");
  }
  const tokenData = await response.json();
  await supabaseClient.from("meli_credentials").update({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, last_updated: new Date().toISOString() }).eq("user_id", userId);
  console.log("Paso D: Token refrescado exitosamente.");
  return tokenData.access_token;
}

serve(async (req) => {
  console.log("--- Invocación de DIAGNÓSTICO 'get-ml-labels' iniciada ---");
  if (req.method === "OPTIONS") { return new Response("ok", { headers: corsHeaders }); }

  try {
    console.log("Paso 1: Creando cliente Supabase...");
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
    
    console.log("Paso 2: Obteniendo usuario...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");
    console.log(`Paso 3: Usuario obtenido: ${user.id}`);

    const { shipment_ids, format } = await req.json();
    if (!shipment_ids || !format) throw new Error(`Faltan parámetros. Recibido: shipment_ids=${shipment_ids}, format=${format}`);
    console.log(`Paso 4: Parámetros recibidos: shipment_ids=${shipment_ids}, format=${format}`);

    const accessToken = await getMeliToken(supabase, user.id);
    console.log("Paso 5: Token de ML obtenido.");

    let url = '';
    if (format === 'pdf') {
        url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipment_ids}&savePdf=Y`;
    } else if (format === 'zpl') {
        url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipment_ids}&response_type=zpl2`;
    } else {
        throw new Error("Formato no soportado.");
    }
    console.log(`Paso 6: Realizando fetch a: ${url}`);
    
    const meliResponse = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    console.log(`Paso 7: Respuesta recibida de ML con Status: ${meliResponse.status}`);

    if (!meliResponse.ok) {
        const errorText = await meliResponse.text();
        throw new Error(`Error de la API de ML: ${errorText}`);
    }

    console.log("Paso 8: Devolviendo respuesta de ML al cliente.");
    return new Response(meliResponse.body, {
        headers: { ...corsHeaders, 'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/plain' }
    });

  } catch (error) {
    console.error("--- ERROR EN DIAGNÓSTICO 'get-ml-labels' ---:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});