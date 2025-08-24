import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0'
import { corsHeaders } from '../_shared/cors.ts'

async function getRefreshedToken(refreshToken: string, supabaseClient: any, userId: string) {
  const MELI_APP_ID = Deno.env.get('MELI_APP_ID')!
  const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')!
  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: MELI_APP_ID, client_secret: MELI_CLIENT_SECRET, refresh_token: refreshToken, }),
  })
  if (!response.ok) throw new Error('Failed to refresh Mercado Libre token')
  const newTokens = await response.json()
  const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
  await supabaseClient.from('mercadolibre_tokens').update({ access_token: newTokens.access_token, refresh_token: newTokens.refresh_token, expires_at: expires_at, }).eq('user_id', userId)
  return newTokens.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const token = req.headers.get('Authorization')!.replace('Bearer ', '')
    const { data: { user } } = await supabaseClient.auth.getUser(token)
    if (!user) throw new Error('User not found')

    let { data: mlTokens } = await supabaseClient.from('mercadolibre_tokens').select('access_token, refresh_token, expires_at, meli_user_id').eq('user_id', user.id).single()
    if (!mlTokens) throw new Error('Mercado Libre token not found for user.')

    if (new Date(mlTokens.expires_at) < new Date()) {
      mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, supabaseClient, user.id)
    }
    
    const meliUserId = mlTokens.meli_user_id;
    const listingsIdsResponse = await fetch(`https://api.mercadolibre.com/users/${meliUserId}/items/search`, { headers: { Authorization: `Bearer ${mlTokens.access_token}` } })
    const listingsIdsData = await listingsIdsResponse.json()
    const listingIds = listingsIdsData.results

    if (!listingIds || listingIds.length === 0) {
        await supabaseClient.from('mercadolibre_listings').delete().eq('user_id', user.id);
        return new Response(JSON.stringify({ success: true, count: 0, message: 'No listings found.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    const CHUNK_SIZE = 20;
    const allListingsToUpsert = [];
    const attributesToFetch = 'id,title,price,variations,attributes,permalink,available_quantity,status,listing_type_id,thumbnail';

    for (let i = 0; i < listingIds.length; i += CHUNK_SIZE) {
        const chunk = listingIds.slice(i, i + CHUNK_SIZE);
        const itemsDetailsResponse = await fetch(`https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=${attributesToFetch}`, { 
            headers: { Authorization: `Bearer ${mlTokens.access_token}` } 
        });

        if (!itemsDetailsResponse.ok) {
            console.error(`Error fetching chunk`);
            continue;
        }

        const itemsChunk = await itemsDetailsResponse.json();
        if (!Array.isArray(itemsChunk)) continue;

        for (const item of itemsChunk) {
            if (!item.body) continue;
            const hasVariations = item.body.variations && item.body.variations.length > 0;

            if (hasVariations) {
                for (const variation of item.body.variations) {
                    let sku = variation.seller_custom_field;
                    if (!sku && variation.attributes) {
                        const gtinAttribute = variation.attributes.find(attr => attr.id === 'GTIN');
                        if (gtinAttribute) sku = gtinAttribute.value_name;
                    }
                    if (sku) {
                        allListingsToUpsert.push({
                            user_id: user.id, meli_id: item.body.id, meli_variation_id: variation.id,
                            title: `${item.body.title} (${variation.attribute_combinations.map(attr => attr.value_name).join(' - ')})`,
                            sku: sku, price: variation.price || item.body.price, permalink: item.body.permalink,
                            available_quantity: variation.available_quantity, last_synced_at: new Date().toISOString(),
                            status: item.body.status, listing_type_id: item.body.listing_type_id, thumbnail_url: item.body.thumbnail,
                        });
                    }
                }
            } else {
                let sku = null;
                if (item.body.attributes) {
                    const skuAttribute = item.body.attributes.find(attr => attr.id === 'SELLER_SKU');
                    if (skuAttribute && skuAttribute.value_name) {
                        sku = skuAttribute.value_name;
                    } else {
                        const gtinAttribute = item.body.attributes.find(attr => attr.id === 'GTIN');
                        if (gtinAttribute && gtinAttribute.value_name) sku = gtinAttribute.value_name;
                    }
                }
                if (sku) {
                     allListingsToUpsert.push({
                        user_id: user.id, meli_id: item.body.id, meli_variation_id: null,
                        title: item.body.title, sku: sku, price: item.body.price,
                        permalink: item.body.permalink, available_quantity: item.body.available_quantity,
                        last_synced_at: new Date().toISOString(), status: item.body.status,
                        listing_type_id: item.body.listing_type_id, thumbnail_url: item.body.thumbnail,
                    });
                }
            }
        }
    }
    
    await supabaseClient.from('mercadolibre_listings').delete().eq('user_id', user.id);
    if (allListingsToUpsert.length > 0) {
        const { error: insertError } = await supabaseClient.from('mercadolibre_listings').insert(allListingsToUpsert)
        if (insertError) throw insertError
    }

    return new Response(JSON.stringify({ success: true, count: allListingsToUpsert.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })

  } catch (error) {
    console.error('Error in Edge Function:', error)
    // Si el error es por el token, devolvemos un status 401
    const isTokenError = error.message === 'Mercado Libre token not found for user.' || error.message === 'Failed to refresh Mercado Libre token';
    return new Response(JSON.stringify({ error: error.message }), {
      status: isTokenError ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})