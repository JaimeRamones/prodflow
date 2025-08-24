// Ruta: supabase/functions/prodflow-update-ml/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
// --- CAMBIO 1: Importamos nuestra nueva función compartida ---
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

    const stockChanged = updatedProduct.stock_disponible !== oldProduct.stock_disponible
    const priceChanged = updatedProduct.sale_price !== oldProduct.sale_price

    if (!stockChanged && !priceChanged) {
      return new Response(JSON.stringify({ message: 'No change detected.' }))
    }

    const skuToUpdate = updatedProduct.sku
    const productUserId = updatedProduct.user_id;
    
    if (!skuToUpdate || !productUserId) {
      throw new Error(`Invalid data from product webhook. SKU: ${skuToUpdate}, UserID: ${productUserId}`);
    }

    const { data: listings, error: listingError } = await supabaseAdmin
      .from('mercadolibre_listings')
      .select('meli_id, user_id')
      .eq('sku', skuToUpdate)
      .eq('user_id', productUserId)

    if (listingError) {
      throw new Error(`Database error fetching listings: ${listingError.message}`);
    }

    if (!listings || listings.length === 0) {
      return new Response(JSON.stringify({ message: `No listings found for SKU: ${skuToUpdate}` }))
    }
    
    // --- CAMBIO 2: Pedimos más datos del token para saber si está vencido ---
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('mercadolibre_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', productUserId)
      .single()

    if (tokenError || !tokenData) {
      throw new Error(`No Mercado Libre token found for user ${productUserId}`)
    }

    let accessToken = tokenData.access_token;
    // --- CAMBIO 3: Lógica para refrescar el token si está vencido ---
    if (new Date(tokenData.expires_at) < new Date()) {
        console.log("Token expired, refreshing...");
        accessToken = await getRefreshedToken(tokenData.refresh_token, productUserId, supabaseAdmin);
    }

    const updatePayload: { available_quantity?: number, price?: number } = {};
    if (stockChanged) {
        updatePayload.available_quantity = updatedProduct.stock_disponible;
    }
    if (priceChanged) {
        updatePayload.price = updatedProduct.sale_price;
    }

    for (const listing of listings) {
      console.log(`Updating listing ${listing.meli_id}...`);
      
      const response = await fetch(`https://api.mercadolibre.com/items/${listing.meli_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`, // Usamos el token (potencialmente refrescado)
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      })

      if (!response.ok) {
        const errorBody = await response.json()
        console.error(`Failed to update listing ${listing.meli_id}: ${errorBody.message}`);
      } else {
        console.log(`Successfully updated listing ${listing.meli_id}.`);
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