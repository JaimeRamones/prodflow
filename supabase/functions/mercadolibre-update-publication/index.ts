// Ruta: supabase/functions/mercadolibre-update-publication/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { publication, newPrice, newSku } = await req.json();
    const { meli_id, meli_variation_id } = publication;
    
    const { data: userCredentials, error: credError } = await supabaseAdmin
      .from('meli_credentials')
      .select('access_token, user_id')
      .limit(1).single();
    if (credError) throw credError;
    
    const accessToken = userCredentials.access_token;

    // 1. LEER el estado actual de la publicación desde Mercado Libre
    const getItemResponse = await fetch(`https://api.mercadolibre.com/items/${meli_id}?include_attributes=all`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!getItemResponse.ok) throw new Error('No se pudo obtener la publicación de Mercado Libre.');
    const currentItem = await getItemResponse.json();

    // 2. MODIFICAR los datos en memoria según la regla de la API
    let body;
    if (meli_variation_id && currentItem.variations && currentItem.variations.length > 0) {
      // --- INICIA LA CORRECCIÓN ---
      // Para publicaciones con variaciones
      const updatedVariations = currentItem.variations.map(variation => {
        if (variation.id === meli_variation_id) {
          // Modificamos la variación, pero SIN el SKU aquí
          const newVariation = { ...variation, price: newPrice };
          // El campo 'seller_custom_field' no debe ir en la variación
          delete newVariation.seller_custom_field; 
          return newVariation;
        }
        return variation;
      });

      // Construimos el cuerpo: SKU a nivel de item, y el array de variaciones solo con el precio actualizado.
      body = {
        seller_custom_field: newSku, // SKU a nivel del item
        variations: updatedVariations // Array de variaciones actualizado
      };
      // --- FIN DE LA CORRECCIÓN ---

    } else {
      // Para publicaciones simples, sin variaciones, la lógica anterior estaba bien
      body = {
        price: newPrice,
        seller_custom_field: newSku
      };
    }
    
    // 3. ENVIAR la estructura completa y actualizada de vuelta a Mercado Libre
    const updateResponse = await fetch(`https://api.mercadolibre.com/items/${meli_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      console.error('ML API Error:', JSON.stringify(errorData, null, 2));
      throw new Error(`Error de Mercado Libre: ${errorData.message}`);
    }

    // 4. Actualizar nuestra base de datos local para mantener la consistencia
    const { error: dbError } = await supabaseAdmin
      .from('mercadolibre_listings')
      .update({ price: newPrice, sku: newSku })
      .eq('meli_id', meli_id)
      .eq('meli_variation_id', meli_variation_id);
      
    if (dbError) throw dbError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in update function:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});