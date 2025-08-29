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

    const getItemResponse = await fetch(`https://api.mercadolibre.com/items/${meli_id}?include_attributes=all`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!getItemResponse.ok) throw new Error('No se pudo obtener la publicación de Mercado Libre.');
    const currentItem = await getItemResponse.json();

    let body;
    if (meli_variation_id && currentItem.variations && currentItem.variations.length > 0) {
      const updatedVariations = currentItem.variations.map(variation => {
        if (variation.id === meli_variation_id) {
          const newVariation = { ...variation, price: newPrice };
          delete newVariation.seller_custom_field; 
          return newVariation;
        }
        return variation;
      });
      body = {
        seller_custom_field: newSku,
        variations: updatedVariations
      };
    } else {
      body = {
        price: newPrice,
        seller_custom_field: newSku
      };
    }
    
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

    // --- INICIA LA CORRECCIÓN PARA LA BASE DE DATOS ---
    // 1. Construimos la consulta base
    let query = supabaseAdmin
      .from('mercadolibre_listings')
      .update({ price: newPrice, sku: newSku })
      .eq('meli_id', meli_id);

    // 2. Añadimos el filtro correcto para la variación
    if (meli_variation_id) {
      // Si SÍ hay ID de variación, usamos .eq()
      query = query.eq('meli_variation_id', meli_variation_id);
    } else {
      // Si NO hay ID de variación (es null), usamos .is()
      query = query.is('meli_variation_id', null);
    }
    
    // 3. Ejecutamos la consulta
    const { error: dbError } = await query;
    // --- FIN DE LA CORRECCIÓN ---
      
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