// supabase/functions/prodflow-update-ml/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { getRefreshedToken } from '../_shared/meli_token.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const updatedProduct = payload.record
    const oldProduct = payload.old_record

    if (!updatedProduct || !oldProduct) {
        throw new Error('Invalid webhook payload.');
    }

    const stockChanged = updatedProduct.stock_disponible !== oldProduct.stock_disponible
    const priceChanged = updatedProduct.sale_price !== oldProduct.sale_price
    // --- ¡NUEVO CAMBIO AQUÍ! ---
    const skuChanged = updatedProduct.sku !== oldProduct.sku

    // Si no cambió nada de lo que nos importa, terminamos.
    if (!stockChanged && !priceChanged && !skuChanged) {
      return new Response(JSON.stringify({ message: 'No relevant change detected.' }))
    }

    // Usamos el SKU viejo para encontrar la publicación, por si acaso el SKU es lo que cambió.
    const skuToFind = oldProduct.sku
    
    const { data: listings, error: listingError } = await supabaseAdmin
      .from('mercadolibre_listings')
      .select('meli_id, user_id')
      .eq('sku', skuToFind)
      .eq('user_id', updatedProduct.user_id)

    if (listingError) throw listingError;
    if (!listings || listings.length === 0) {
      return new Response(JSON.stringify({ message: `No ML listings found for SKU: ${skuToFind}` }))
    }
    
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('meli_credentials')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', updatedProduct.user_id)
      .single()

    if (tokenError || !tokenData) {
      throw new Error(`No Mercado Libre token found for user ${updatedProduct.user_id}`)
    }

    let accessToken = tokenData.access_token;
    if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
        accessToken = await getRefreshedToken(tokenData.refresh_token, updatedProduct.user_id, supabaseAdmin);
    }

    // --- ¡NUEVO CAMBIO AQUÍ! ---
    // Preparamos los datos a enviar a Mercado Libre
    const updatePayload: { available_quantity?: number; price?: number; seller_custom_field?: string; } = {};
    if (stockChanged) updatePayload.available_quantity = updatedProduct.stock_disponible;
    if (priceChanged) updatePayload.price = updatedProduct.sale_price;
    // Si el SKU cambió, se lo enviamos a ML como 'seller_custom_field'
    if (skuChanged) updatePayload.seller_custom_field = updatedProduct.sku;

    for (const listing of listings) {
      console.log(`Updating ML listing ${listing.meli_id} with payload:`, updatePayload);
      
      const response = await fetch(`https://api.mercadolibre.com/items/${listing.meli_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      })

      if (!response.ok) {
        const errorBody = await response.json()
        console.error(`Failed to update listing ${listing.meli_id}: ${errorBody.message}`);
      } else {
        console.log(`Successfully updated listing ${listing.meli_id}.`);
        // Si el SKU cambió, también lo actualizamos en nuestra tabla de listings
        if (skuChanged) {
            await supabaseAdmin.from('mercadolibre_listings').update({ sku: updatedProduct.sku }).eq('meli_id', listing.meli_id);
        }
      }
    }
    
    return new Response(JSON.stringify({ success: true, updated_count: listings.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in prodflow-update-ml function:', error.message) 
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})