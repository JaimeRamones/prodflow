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

    // Obtener el token de MELI para ese usuario usando el nombre correcto de tabla
    const { data: authData, error: authError } = await supabaseClient
      .from('meli_credentials') // ✅ Corregido: ahora usa el nombre real de la tabla
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
        // Flexibilidad para diferentes formatos de columnas (Integraly vs manual)
        const titulo = pub.Título || pub.Title || pub.title || '';
        const categoria = pub.Categoría || pub.Category || pub.category_id || pub._categoria || '';
        const precio = pub.Precio || pub.Price || pub.price || 0;
        const stock = pub.Stock || pub.Quantity || pub.available_quantity || 0;
        const fotos = pub.Fotos || pub.Photos || pub.pictures || pub.imagen || '';
        const marca = pub.Marca || pub.Brand || pub.brand || '';
        const sku = pub.SKU || pub.sku || pub.seller_sku || '';

        const payload = {
          title: titulo,
          category_id: categoria,
          price: parseFloat(precio) || 0,
          currency_id: 'ARS',
          available_quantity: parseInt(stock, 10) || 0,
          buying_mode: 'buy_it_now',
          listing_type_id: 'gold_special',
          condition: 'new',
          pictures: fotos ? [{ source: fotos }] : [],
          attributes: [
            ...(marca ? [{ id: 'BRAND', value_name: marca }] : []),
            ...(sku ? [{ id: 'SELLER_SKU', value_name: sku }] : [])
          ],
        };
        
        // Solo procesar si tiene título y categoría mínimos
        if (titulo && categoria) {
          await meliApiCall('https://api.mercadolibre.com/items', 'POST', accessToken, payload);
          successCount++;
        } else {
          errorCount++;
          errors.push(`Fila ${publications.indexOf(pub) + 1}: Faltan datos obligatorios (Título o Categoría)`);
        }
      } catch (err) {
        errorCount++;
        errors.push(`SKU ${pub.SKU || pub.sku || 'N/A'}: ${err.message}`);
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