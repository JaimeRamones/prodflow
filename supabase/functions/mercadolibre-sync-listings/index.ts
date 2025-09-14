import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now();
  const syncTime = new Date().toISOString(); 

  try {
    // MANEJAR TANTO LLAMADAS MANUALES COMO CRON JOBS (como en tu código anterior)
    let userId;
    
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
      )
      
      const { data: { user } } = await supabaseClient.auth.getUser()
      if (user) {
        userId = user.id;
        console.log('Usuario autenticado encontrado:', userId);
      }
    } catch (error) {
      console.log('Sin usuario autenticado, asumiendo cron job');
    }

    if (!userId) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data: firstUser } = await supabaseAdmin
        .from('meli_credentials')
        .select('user_id')
        .limit(1)
        .single();

      if (!firstUser) {
        throw new Error('No hay usuarios con credenciales de MercadoLibre configuradas');
      }
      
      userId = firstUser.user_id;
      console.log('Usando primer usuario con ML para cron job:', userId);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Obtener Tokens
    let { data: mlTokens } = await supabaseAdmin
      .from('meli_credentials').select('*').eq('user_id', userId).single()

    if (!mlTokens || !mlTokens.meli_user_id) throw new Error('Mercado Libre credentials not found.');
    
    if (mlTokens.expires_at && new Date(mlTokens.expires_at) < new Date()) {
      mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, supabaseAdmin, userId)
    }
    
    const meliUserId = mlTokens.meli_user_id;

    // DECISIÓN INTELIGENTE: ¿Sincronización completa o incremental?
    const { data: existingData, count: existingCount } = await supabaseAdmin
        .from('mercadolibre_listings')
        .select('meli_id, meli_variation_id, prodflow_stock, prodflow_price, sync_enabled', { count: 'exact' })
        .eq('user_id', userId);

    const isFirstSync = !existingCount || existingCount === 0;
    const forceFullSync = req.headers.get('X-Force-Full-Sync') === 'true';
    
    if (isFirstSync || forceFullSync) {
        console.log(`Ejecutando sincronización COMPLETA (${isFirstSync ? 'primera vez' : 'forzada'})`);
        return await fullSync();
    } else {
        console.log(`Ejecutando sincronización INCREMENTAL (${existingCount} publicaciones existentes)`);
        return await incrementalSync();
    }

    // FUNCIÓN: Sincronización Completa (tu código V21 original)
    async function fullSync() {
        console.log('Obteniendo TODAS las publicaciones con Scroll API...');
        
        // Obtener IDs de Publicaciones (Scroll API)
        const allListingIds = [];
        let scrollId: string | null = null;

        while (true) {
            if (Date.now() - startTime > 240000) {
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
            console.log(`Obtenidas ${allListingIds.length} IDs hasta ahora...`);
            if (!scrollId || results.length < 100) break;
        }

        return await processAllListings(allListingIds, existingData);
    }

    // FUNCIÓN: Sincronización Incremental (solo nuevas)
    async function incrementalSync() {
        console.log('Buscando publicaciones nuevas...');
        
        // Obtener primeras 200 publicaciones más recientes
        const url = `https://api.mercadolibre.com/users/${meliUserId}/items/search?limit=50&offset=0&sort=date_desc`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${mlTokens.access_token}` } });
        if (!response.ok) throw new Error("Failed to fetch recent listings from ML.");

        const data = await response.json();
        const recentIds = data.results || [];
        
        if (recentIds.length === 0) {
            return new Response(JSON.stringify({ 
                success: true, 
                count: 0, 
                message: 'No hay publicaciones recientes para revisar',
                sync_type: 'incremental',
                duration: `${(Date.now() - startTime) / 1000}s` 
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Filtrar solo las que NO tenemos en BD
        const existingMeliIds = new Set((existingData || []).map(item => item.meli_id));
        const newIds = recentIds.filter(id => !existingMeliIds.has(id));
        
        if (newIds.length === 0) {
            return new Response(JSON.stringify({ 
                success: true, 
                count: 0, 
                message: 'No se encontraron publicaciones nuevas',
                sync_type: 'incremental',
                checked: recentIds.length,
                duration: `${(Date.now() - startTime) / 1000}s` 
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        console.log(`Encontradas ${newIds.length} publicaciones nuevas de ${recentIds.length} revisadas`);
        return await processAllListings(newIds, existingData);
    }

    // FUNCIÓN: Procesar Listados (común para ambos modos)
    async function processAllListings(listingIds: string[], existingData: any[]) {
        // Obtener Detalles en Lotes
        const CHUNK_SIZE = 20;
        const rawMeliData = [];
        const attributesToFetch = 'id,title,price,variations,attributes,permalink,available_quantity,sold_quantity,status,listing_type_id,thumbnail,pictures';

        for (let i = 0; i < listingIds.length; i += CHUNK_SIZE) {
            if (Date.now() - startTime > 240000) {
                console.warn("Execution time nearing limit. Proceeding with partial data.");
                break; 
            }
            const chunk = listingIds.slice(i, i + CHUNK_SIZE);
            const itemsDetailsResponse = await fetch(`https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=${attributesToFetch}`, { 
                headers: { Authorization: `Bearer ${mlTokens.access_token}` } 
            });

            if (itemsDetailsResponse.ok) {
                const itemsChunk = await itemsDetailsResponse.json();
                if (Array.isArray(itemsChunk)) rawMeliData.push(...itemsChunk);
            }
            
            console.log(`Procesando detalles: ${Math.min(i + CHUNK_SIZE, listingIds.length)}/${listingIds.length}`);
        }

        // Procesar Datos Crudos
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

        // Fusionar con datos existentes
        const existingDataMap = new Map();
        for (const item of (existingData || [])) {
            const identifier = createIdentifier(userId, item.meli_id, item.meli_variation_id);
            existingDataMap.set(identifier, item);
        }

        const listingsToUpsert = processedListings.map(listing => {
            const existingItem = existingDataMap.get(listing.identifier);
            const { identifier, ...restOfListing } = listing;

            if (existingItem) {
                return {
                    ...restOfListing,
                    prodflow_stock: existingItem.prodflow_stock,
                    prodflow_price: existingItem.prodflow_price,
                    sync_enabled: existingItem.sync_enabled === false ? false : true
                };
            } else {
                return {
                    ...restOfListing,
                    prodflow_stock: listing.available_quantity,
                    prodflow_price: listing.price,
                    sync_enabled: true
                };
            }
        });

        // Ejecutar UPSERT Masivo
        if (listingsToUpsert.length > 0) {
            console.log(`Starting UPSERT for ${listingsToUpsert.length} items...`);
            const DB_CHUNK_SIZE = 500; 
            for (let i = 0; i < listingsToUpsert.length; i += DB_CHUNK_SIZE) {
                const chunk = listingsToUpsert.slice(i, i + DB_CHUNK_SIZE);

                const { error: upsertError } = await supabaseAdmin
                    .from('mercadolibre_listings')
                    .upsert(chunk, { onConflict: 'user_id, meli_id, meli_variation_id' });
                
                if (upsertError) throw upsertError;
            }
        }

        const syncType = isFirstSync || forceFullSync ? 'complete' : 'incremental';
        const duration = (Date.now() - startTime) / 1000;
        
        return new Response(JSON.stringify({ 
            success: true, 
            count: listingsToUpsert.length, 
            sync_type: syncType,
            total_processed: listingIds.length,
            message: `${listingsToUpsert.length} publicaciones ${syncType === 'complete' ? 'sincronizadas' : 'nuevas agregadas'}`,
            duration: `${duration}s` 
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Error in sync function V21-Auto:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})