// supabase/functions/mercadolibre-webhook-handler/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    console.log('Webhook de Mercado Libre recibido:', payload)

    // Mercado Libre a veces envía un "challenge" para verificar que la URL funciona.
    // Si lo recibimos, debemos responderlo para validar el webhook.
    if (payload.challenge) {
      return new Response(JSON.stringify({ challenge: payload.challenge }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }
    
    // Verificamos que sea una notificación sobre publicaciones (items)
    if (payload.topic === 'items') {
      const resourceUrl = payload.resource; // ej: /items/MLA123456
      const meliId = resourceUrl.split('/')[2];
      
      // Obtenemos los datos del usuario asociado a esta notificación
      const { data: userCredentials, error: userError } = await supabaseAdmin
        .from('meli_credentials')
        .select('user_id, access_token')
        .eq('meli_user_id', payload.user_id)
        .single();

      if (userError || !userCredentials) {
        throw new Error(`No se encontró usuario para meli_user_id: ${payload.user_id}`);
      }

      // Con el token del usuario, pedimos los detalles actualizados del item a ML
      const itemResponse = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
        headers: { Authorization: `Bearer ${userCredentials.access_token}` },
      });

      if (!itemResponse.ok) {
        throw new Error(`No se pudieron obtener los detalles del item ${meliId} de ML.`);
      }

      const itemData = await itemResponse.json();

      // Actualizamos nuestra base de datos con la nueva información
      const { error: updateError } = await supabaseAdmin
        .from('mercadolibre_listings')
        .update({
          title: itemData.title,
          price: itemData.price,
          available_quantity: itemData.available_quantity,
          status: itemData.status,
          last_synced_at: new Date().toISOString(),
        })
        .eq('meli_id', meliId)
        .eq('user_id', userCredentials.user_id); // Aseguramos actualizar solo el del usuario correcto

      if (updateError) {
        throw new Error(`Error al actualizar la publicación en la BD: ${updateError.message}`);
      }

      console.log(`Publicación ${meliId} actualizada exitosamente por webhook.`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Error en el webhook handler de ML:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})