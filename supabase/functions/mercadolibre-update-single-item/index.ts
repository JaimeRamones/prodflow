// Reemplaza TODO el contenido de tu archivo: supabase/functions/mercadolibre-update-single-item/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función genérica para llamadas a la API de MELI
async function meliApiCall(url, method, token, body = null) {
  const options = {
    method: method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
  };
  const response = await fetch(url, options);
  const responseBody = await response.json();

  if (!response.ok) {
    // Adjuntamos el cuerpo del error para poder inspeccionarlo
    const error = new Error(`Error ${response.status} de la API de MELI`);
    error.body = responseBody;
    throw error;
  }
  return responseBody;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { record } = await req.json();
    const { meliId, accessToken, title, description, sku, attributes, pictures, price, stock } = record;

    if (!meliId || !accessToken) {
      throw new Error('meliId y accessToken son requeridos');
    }

    const itemUrl = `https://api.mercadolibre.com/items/${meliId}`;
    const descriptionUrl = `${itemUrl}/description`;

    // --- INTENTO 1: ACTUALIZACIÓN COMPLETA ---
    const fullPayload = {
      title,
      price,
      available_quantity: stock,
      pictures,
      attributes: attributes || [],
    };
    // Añadir SKU al payload de atributos
    if (sku) {
      fullPayload.attributes = fullPayload.attributes.filter(attr => attr.id !== 'SELLER_SKU');
      fullPayload.attributes.push({ id: 'SELLER_SKU', value_name: sku });
    }

    try {
      console.log(`Intento 1: Actualización completa para ${meliId}...`);
      await meliApiCall(itemUrl, 'PUT', accessToken, fullPayload);
      
      // Si la descripción también se envió, actualizarla por separado
      if (description) {
        await meliApiCall(descriptionUrl, 'PUT', accessToken, { plain_text: description });
      }
      
      console.log(`¡Actualización completa para ${meliId} exitosa!`);

    } catch (error) {
      // --- ANÁLISIS DEL ERROR Y FALLBACK ---
      const errorBody = error.body || {};
      const isRestrictedError = errorBody.message?.includes('has_bids:true') || 
                                errorBody.cause?.some(c => c.code === 'item.attributes.not_modifiable');

      if (isRestrictedError) {
        console.warn(`⚠️ Intento 1 falló por restricción de ventas en ${meliId}. Iniciando Fallback...`);

        // --- INTENTO 2: ACTUALIZACIÓN SEGURA ---
        const safePayload = {
          price,
          available_quantity: stock,
          pictures,
          // Guardamos el SKU en el campo interno como fallback
          seller_custom_field: sku,
        };
        
        console.log(`Intento 2: Actualizando campos permitidos para ${meliId}...`);
        await meliApiCall(itemUrl, 'PUT', accessToken, safePayload);

        // La descripción usualmente se puede modificar
        if (description) {
          await meliApiCall(descriptionUrl, 'PUT', accessToken, { plain_text: description });
        }

        console.log(`¡Actualización de fallback para ${meliId} exitosa! Título y SKU no se modificaron.`);
      } else {
        // Si fue otro tipo de error, lo relanzamos
        throw error;
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Publicación ${meliId} actualizada.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error.body ? JSON.stringify(error.body) : error.message;
    console.error('Error final en la función:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});