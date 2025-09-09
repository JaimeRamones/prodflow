// supabase/functions/get-ml-labels/index.ts
// ESTA VERSIÓN ES LA CORRECTA Y NO NECESITA CAMBIOS.

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

    const { shipment_ids, format } = await req.json();
    if (!shipment_ids || !format) throw new Error("Faltan parámetros.");

    const accessToken = await getMeliToken(supabase, user.id);
    const url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipment_ids}&response_type=${format === 'pdf' ? 'pdf' : 'zpl2'}`;

    const meliResponse = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    const contentType = meliResponse.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        const errorJson = await meliResponse.json();
        throw new Error(`Error de la API de ML: ${errorJson.message || JSON.stringify(errorJson)}`);
    }
    if (!meliResponse.ok) {
        const errorText = await meliResponse.text();
        throw new Error(`Error de la API de ML (Status ${meliResponse.status}): ${errorText}`);
    }

    return new Response(meliResponse.body, {
        headers: { ...corsHeaders, 'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/plain' }
    });
  } catch (error) {
    console.error("Error en get-ml-labels:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});