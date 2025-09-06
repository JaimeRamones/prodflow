import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
// Usamos la versión más reciente compatible con las otras funciones
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// (Funciones Auxiliares: getRefreshedToken, extractSku, createIdentifier)
// Nota: Se asume que estas funciones auxiliares ya existen y son robustas. 
// Se incluyen aquí para proporcionar el código completo.

async function getRefreshedToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) {
    const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID') || Deno.env.get('MELI_APP_ID');
    const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET') || Deno.env.get('MELI_SECRET_KEY');
    if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET) throw new Error("Missing ML credentials env vars.");

    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: MELI_CLIENT_ID,
        client_secret: MELI_CLIENT_SECRET, refresh_token: refreshToken,
      }),
    })
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to refresh ML token: ${errorBody}`);
    }
    const newTokens = await response.json()
    const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
    await supabaseAdmin.from('meli_credentials').update({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: expires_at,
    }).eq('user_id', userId)
    return newTokens.access_token
}

function extractSku(itemAttributes: any[], variationAttributes?: any[], sellerCustomField?: string): string | null {
    if (sellerCustomField) return sellerCustomField.trim();
    const attributes = variationAttributes || itemAttributes;
    if (!attributes) return null;
    const sku = attributes.find(attr => attr.id === 'SELLER_SKU')?.value_name;
    if (sku) return sku.trim();
    const gtin = attributes.find(attr => attr.id === 'GTIN')?.value_name;
    if (gtin) return gtin.trim();
    if (variationAttributes && itemAttributes) {
        return extractSku(itemAttributes, undefined);
    }
    return null;
}

function createIdentifier(userId: string, meliId: string, variationId: string | null | undefined) {
    return `${userId}-${meliId}-${variationId || 'null'}`;
}

// --- Lógica Principal (V21 - Corregida) ---
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now();
  const syncTime = new Date().toISOString(); 

  try {
    // 1. Configuración y Autenticación (Se mantiene igual)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('User not found')
    const userId = user.id;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Obtener Tokens (Se mantiene igual)
    let { data: mlTokens } = await supabaseAdmin
      .from('meli_credentials').select('*').eq('user_id', userId).single()

    if (!mlTokens || !mlTokens.meli_user_id) throw new Error('Mercado Libre credentials not found.');
    
    if (mlTokens.expires_at && new Date(mlTokens.expires_at) < new Date()) {
      mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, supabaseAdmin, userId)
    }
    
    const meliUserId = mlTokens.meli_user_id;

    // 3. Obtener IDs de Publicaciones (Scroll API) (Se mantiene igual)
    const allListingIds = [];
    let scrollId: string | null = null;

    while (true) {
      if (Date.now() - startTime > 240000) { // Límite de 4 minutos
         throw new Error("Execution time exceeded limit during ID fetching.");
      }

      let url = `https://api.mercadolibre.com/users/${meliUserId}/items/search?search_type=scan&limit=100`;
      if (scrollId) url += `&scroll_id=${scrollId}`;
      
      const listingsIdsResponse = await fetch(url, { headers: { Authorization: `Bearer ${mlTokens.access_token}` } });
      if (!listingsIdsResponse.ok) throw new Error("Failed to fetch listing IDs from ML.");

      const listingsIdsData = await listingsIdsResponse.json();
      const results = listingsIdsData.results;
      scrollId = listingsIdsData.scroll_id; 

      if (!results || results.length === 0) break;
      allListingIds.push(...results);
      if (!scrollId || results.length < 100) break;
    }

    // 4. Obtener Detalles en Lotes (Multi-get API) (Se mantiene igual)
    const CHUNK_SIZE = 20;
    const rawMeliData = [];
    const attributesToFetch = 'id,title,price,variations,attributes,permalink,available_quantity,sold_quantity,status,listing_type_id,thumbnail,pictures';

    for (let i = 0; i < allListingIds.length; i += CHUNK_SIZE) {
        if (Date.now() - startTime > 240000) {
            console.warn("Execution time nearing limit. Proceeding with partial data.");
            break; 
        }
      const chunk = allListingIds.slice(i, i + CHUNK_SIZE);
      const itemsDetailsResponse = await fetch(`https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=${attributesToFetch}`, { 
        headers: { Authorization: `Bearer ${mlTokens.access_token}` } 
      });

      if (itemsDetailsResponse.ok) {
        const itemsChunk = await itemsDetailsResponse.json();
        if (Array.isArray(itemsChunk)) rawMeliData.push(...itemsChunk);
      }
    }

    // 5. Procesar Datos Crudos (Se mantiene igual)
    const processedListings = [];

    for (const itemWrapper of rawMeliData) {
        if (!itemWrapper.body || itemWrapper.code !== 200) continue;
        const body = itemWrapper.body;

        if (body.variations && body.variations.length > 0) {
            for (const variation of body.variations) {
                const sku = extractSku(body.attributes, variation.attributes, variation.seller_custom_field);
                const identifier = createIdentifier(userId, body.id, variation.id);

                if (sku) {
                    processedListings.push({
                        user_id: userId, meli_id: body.id, meli_variation_id: variation.id,
                        title: `${body.title} (${variation.attribute_combinations.map(attr => attr.value_name).join(' - ')})`,
                        sku: sku, price: variation.price || body.price, available_quantity: variation.available_quantity,
                        permalink: body.permalink, sold_quantity: variation.sold_quantity, last_synced_at: syncTime, 
                        status: body.status, listing_type_id: body.listing_type_id, thumbnail_url: body.thumbnail, pictures: body.pictures,
                        identifier: identifier
                    });
                }
            }
        } else {
            const sku = extractSku(body.attributes);
            const identifier = createIdentifier(userId, body.id, null);

            if (sku) {
                processedListings.push({
                    user_id: userId, meli_id: body.id, meli_variation_id: null,
                    title: body.title, sku: sku, price: body.price, available_quantity: body.available_quantity,
                    permalink: body.permalink, sold_quantity: body.sold_quantity, last_synced_at: syncTime, 
                    status: body.status, listing_type_id: body.listing_type_id, thumbnail_url: body.thumbnail, pictures: body.pictures,
                    identifier: identifier
                });
            }
        }
    }

    // 6. Recuperar Datos Maestros Existentes
    // ¡CAMBIO V21! Añadimos 'sync_enabled' a la selección para poder preservarlo.
    const { data: existingData, error: fetchError } = await supabaseAdmin
        .from('mercadolibre_listings')
        .select('meli_id, meli_variation_id, prodflow_stock, prodflow_price, sync_enabled')
        .eq('user_id', userId);

    if (fetchError) throw fetchError;

    // Crear mapa para acceso rápido
    const existingDataMap = new Map();
    for (const item of existingData) {
        const identifier = createIdentifier(userId, item.meli_id, item.meli_variation_id);
        existingDataMap.set(identifier, item);
    }

    // 7. Fusionar Datos (Preservar e Inicializar)
    // ¡LÓGICA CORREGIDA V21!
    const listingsToUpsert = processedListings.map(listing => {
        const existingItem = existingDataMap.get(listing.identifier);
        const { identifier, ...restOfListing } = listing;

        if (existingItem) {
            // Si existe: preservamos valores maestros y gestionamos sync_enabled.
            return {
                ...restOfListing,
                prodflow_stock: existingItem.prodflow_stock,
                prodflow_price: existingItem.prodflow_price,
                // Lógica Robusta: Si el usuario lo desactivó manualmente (false), se mantiene desactivado.
                // Si era NULL (el problema actual) o true, se activa (true).
                sync_enabled: existingItem.sync_enabled === false ? false : true
            };
        } else {
            // Si es NUEVO: inicializamos valores maestros Y ACTIVAMOS la sincronización.
            return {
                ...restOfListing,
                prodflow_stock: listing.available_quantity,
                prodflow_price: listing.price,
                sync_enabled: true // <- ¡CLAVE! Inicializamos como activo
            };
        }
    });

    // 8. Ejecutar UPSERT Masivo (Se mantiene igual)
    if (listingsToUpsert.length > 0) {
        console.log(`Starting UPSERT for ${listingsToUpsert.length} items...`);
        const DB_CHUNK_SIZE = 500; 
        for (let i = 0; i < listingsToUpsert.length; i += DB_CHUNK_SIZE) {
            const chunk = listingsToUpsert.slice(i, i + DB_CHUNK_SIZE);

             // 'onConflict' debe coincidir con la restricción UNIQUE creada anteriormente
            const { error: upsertError } = await supabaseAdmin
                .from('mercadolibre_listings')
                .upsert(chunk, { onConflict: 'user_id, meli_id, meli_variation_id' });
            
            if (upsertError) throw upsertError;
        }
    }

    // 9. Limpieza Eficiente (Se mantiene igual)
    if (allListingIds.length > 0) {
        console.log("Cleaning up stale listings...");
        await supabaseAdmin
            .from('mercadolibre_listings')
            .delete()
            .lt('last_synced_at', syncTime)
            .eq('user_id', userId);

    } else if (allListingIds.length === 0 && rawMeliData.length === 0) {
        await supabaseAdmin.from('mercadolibre_listings').delete().eq('user_id', userId);
    }


    const duration = (Date.now() - startTime) / 1000;
    return new Response(JSON.stringify({ success: true, count: listingsToUpsert.length, duration: `${duration}s` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })

  } catch (error) {
    console.error('Error in sync function V21:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})