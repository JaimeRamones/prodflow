// Ruta: supabase/functions/mercadolibre-inflow/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función para hacer llamadas a la API de MELI
async function meliApiCall(url, method, token, body = null) {
  const options = {
    method: method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
  };
  const response = await fetch(url, options);
  const responseBody = await response.json();
  if (!response.ok) {
    const error = new Error(`Error ${response.status} de MELI: ${responseBody.message || 'Error desconocido'}`);
    console.error("Detalle del error de MELI:", responseBody);
    throw error;
  }
  return responseBody;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { publications } = await req.json();
    if (!publications || !Array.isArray(publications)) {
      throw new Error("El cuerpo debe contener un array de 'publications'.");
    }

    // Autenticar al usuario de tu app
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    // Obtener el token de MELI para ese usuario
    const { data: authData, error: authError } = await supabaseClient
      .from('meli_credentials') // Asume que tienes esta tabla
      .select('access_token')
      .eq('user_id', user.id)
      .single();
    if (authError || !authData) throw new Error("No se encontró la autenticación de MELI para este usuario.");
    const accessToken = authData.access_token;

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Procesar cada fila del archivo subido
    for (const pub of publications) {
      try {
        // Asegúrate que los nombres de las columnas en tu CSV coincidan (pub.Titulo, pub.Categoria, etc.)
        const payload = {
          title: pub.Titulo,
          category_id: pub.Categoria,
          price: parseFloat(pub.Precio),
          currency_id: 'ARS',
          available_quantity: parseInt(pub.Stock, 10),
          buying_mode: 'buy_it_now',
          listing_type_id: 'gold_special',
          condition: 'new',
          pictures: [{ source: pub.Fotos }],
          attributes: [
            { id: 'BRAND', value_name: pub.Marca },
            { id: 'SELLER_SKU', value_name: pub.SKU }
          ],
        };
        
        await meliApiCall('https://api.mercadolibre.com/items', 'POST', accessToken, payload);
        successCount++;
      } catch (err) {
        errorCount++;
        errors.push(`SKU ${pub.SKU || 'N/A'}: ${err.message}`);
      }
    }

    const summary = `${successCount} publicaciones procesadas, ${errorCount} con errores.`;
    console.log("Errores de la importación masiva:", errors);

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});