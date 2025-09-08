// supabase/functions/get-ml-labels/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Función auxiliar para obtener y refrescar el token de ML
async function getMeliToken(supabaseClient: any, userId: string) {
  // Intentamos obtener las credenciales. 
  // ¡Importante! RLS debe estar configurado para permitir al usuario leer/actualizar sus propias credenciales.
  const { data: creds, error } = await supabaseClient.from("meli_credentials")
    .select("access_token, refresh_token, last_updated")
    .eq("user_id", userId)
    .single();
  
  if (error || !creds) throw new Error("Credenciales de ML no encontradas o acceso denegado (Verificar RLS).");

  // Verificar antigüedad (Duran 6 horas = 21600 segundos)
  const tokenAge = (new Date().getTime() - new Date(creds.last_updated).getTime()) / 1000;
  if (tokenAge < 21000) return creds.access_token;

  console.log("Token expirado, refrescando...");

  // Refrescar Token
  // Obtenemos las variables de entorno (Secrets de Supabase)
  const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID');
  const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET');

  if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET) {
    throw new Error("Faltan variables de entorno de ML (CLIENT_ID/SECRET) en Supabase.");
  }

  const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: MELI_CLIENT_ID,
      client_secret: MELI_CLIENT_SECRET,
      refresh_token: creds.refresh_token
  });

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body: params,
  });

  if (!response.ok) {
      const errorText = await response.text();
      console.error("Error refreshing ML token:", errorText);
      throw new Error("Error al refrescar token de ML.");
  }
  
  const tokenData = await response.json();
  await supabaseClient.from("meli_credentials").update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    last_updated: new Date().toISOString()
  }).eq("user_id", userId);
  
  return tokenData.access_token;
}


serve(async (req) => {
  // Manejo de CORS (Preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Autenticación
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta Authorization header.');

    // Inicializamos el cliente de Supabase con el contexto del usuario que llama (RLS aplicado)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Usuario no autenticado.')

    // 2. Validación
    const { shipment_ids, format } = await req.json();
    if (!shipment_ids || !format) {
        throw new Error("Faltan parámetros (shipment_ids o format).");
    }

    // 3. Obtener Token ML
    const accessToken = await getMeliToken(supabaseClient, user.id);

    // 4. Llamada a API ML
    const responseType = format === 'pdf' ? 'pdf' : 'zpl2';
    const url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipment_ids}&response_type=${responseType}`;

    const meliResponse = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!meliResponse.ok) {
        const errorText = await meliResponse.text();
        console.error(`ML API Error (${meliResponse.status}): ${errorText}`);
        // Devolvemos el error de ML al frontend
        return new Response(JSON.stringify({ error: `Error de Mercado Libre: ${errorText}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: meliResponse.status
        });
    }

    // 5. Devolver la respuesta (¡LA SOLUCIÓN CLAVE!)
    // Usamos arrayBuffer() para leer toda la respuesta binaria en memoria (buffering) en Deno.
    const arrayBuffer = await meliResponse.arrayBuffer();

    if (arrayBuffer.byteLength === 0) {
        throw new Error("La respuesta de Mercado Libre estaba vacía.");
    }

    const contentType = format === 'pdf' ? 'application/pdf' : 'text/plain';

    // Devolvemos el buffer binario directamente
    return new Response(arrayBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Length': arrayBuffer.byteLength.toString(),
      },
      status: 200
    });

  } catch (error) {
    console.error("Error grave en get-ml-labels:", error);
    // Devolvemos errores internos al frontend
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})