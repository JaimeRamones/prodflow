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
    
    // Obtener las credenciales del usuario de la base de datos
    const { data: userCredentials, error: credError } = await supabaseAdmin
      .from('meli_credentials')
      .select('access_token, user_id')
      .limit(1).single(); // Asumimos una sola credencial por ahora
    if (credError) throw credError;
    
    const accessToken = userCredentials.access_token;
    const userId = userCredentials.user_id;

    let body;
    // La API de ML requiere un formato diferente si la publicación tiene variaciones
    if (meli_variation_id) {
      body = {
        variations: [{
          id: meli_variation_id,
          price: newPrice,
          seller_custom_field: newSku
        }]
      };
    } else {
      body = {
        price: newPrice,
        seller_custom_field: newSku
      };
    }
    
    // 1. Llamada a la API de Mercado Libre para actualizar
    const response = await fetch(`https://api.mercadolibre.com/items/${meli_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Error de Mercado Libre: ${errorData.message}`);
    }

    // 2. Actualizar nuestra base de datos local para mantener la consistencia
    const updateData = { price: newPrice, sku: newSku };
    let query = supabaseAdmin.from('mercadolibre_listings').update(updateData).eq('meli_id', meli_id);
    if (meli_variation_id) {
      query = query.eq('meli_variation_id', meli_variation_id);
    }
    const { error: dbError } = await query;
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