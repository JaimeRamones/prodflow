import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

async function getRefreshedToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) {
    const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID') || Deno.env.get('MELI_APP_ID');
    const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET') || Deno.env.get('MELI_SECRET_KEY');
    
    if (!MELI_CLIENT_ID || !MELI_CLIENT_SECRET) {
        throw new Error("Missing ML credentials env vars.");
    }

    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: MELI_CLIENT_ID,
            client_secret: MELI_CLIENT_SECRET,
            refresh_token: refreshToken,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to refresh ML token: ${errorBody}`);
    }

    const newTokens = await response.json();
    const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();
    
    await supabaseAdmin.from('meli_credentials').update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: expires_at,
    }).eq('user_id', userId);

    return newTokens.access_token;
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

async function findProductBySkuBatch(supabaseAdmin: SupabaseClient, skus: string[], userId: string) {
    const { data: products } = await supabaseAdmin
        .from('products')
        .select('id, sku, safety_stock')
        .in('sku', skus)
        .eq('user_id', userId);
    
    const productMap = new Map();
    (products || []).forEach(product => {
        productMap.set(product.sku, { id: product.id, safety_stock: product.safety_stock });
    });
    
    return productMap;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startTime = Date.now();
    const syncTime = new Date().toISOString();

    try {
        // Leer parámetros del request
        const body = await req.json().catch(() => ({}));
        const forceIncremental = body.forceIncremental || false;
        const preserveConfig = body.preserveConfig || false;
        const includeDescriptions = body.includeDescriptions || false;

        // Obtener userId (manual o cron job)
        let userId: string;
        
        try {
            const supabaseClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
            );
            
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
                userId = user.id;
                console.log('Usuario autenticado encontrado:', userId);
            }
        } catch (error) {
            console.log('Sin usuario autenticado, asumiendo cron job');
        }

        if (!userId!) {
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

        // Obtener credenciales de ML
        let { data: mlTokens } = await supabaseAdmin
            .from('meli_credentials')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (!mlTokens || !mlTokens.meli_user_id) {
            throw new Error('Mercado Libre credentials not found.');
        }
        
        if (mlTokens.expires_at && new Date(mlTokens.expires_at) < new Date()) {
            mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, supabaseAdmin, userId);
        }
        
        const meliUserId = mlTokens.meli_user_id;

        // Determinar tipo de sincronización - MEJORADO
        const { data: existingData, count: existingCount } = await supabaseAdmin
            .from('mercadolibre_listings')
            .select('meli_id, meli_variation_id, prodflow_stock, prodflow_price, sync_enabled, safety_stock', { count: 'exact' })
            .eq('user_id', userId);

        const isFirstSync = !existingCount || existingCount === 0;
        const forceFullSync = req.headers.get('X-Force-Full-Sync') === 'true' && !forceIncremental;
        
        let listingIds: string[] = [];
        
        if (isFirstSync || forceFullSync) {
            console.log(`Ejecutando sincronización COMPLETA (${isFirstSync ? 'primera vez' : 'forzada'})`);
            listingIds = await getAllListingIds(meliUserId, mlTokens.access_token, startTime);
        } else {
            console.log(`Ejecutando sincronización INCREMENTAL (${existingCount} publicaciones existentes)`);
            listingIds = await getNewListingIds(meliUserId, mlTokens.access_token, existingData || []);
            
            if (listingIds.length === 0) {
                return new Response(JSON.stringify({
                    success: true,
                    count: 0,
                    message: 'No se encontraron publicaciones nuevas',
                    sync_type: 'incremental',
                    duration: `${(Date.now() - startTime) / 1000}s`
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        // Procesar publicaciones
        console.log(`Procesando ${listingIds.length} publicaciones...`);
        const processedListings = await processListingDetails(
            listingIds, 
            mlTokens.access_token, 
            userId, 
            syncTime, 
            supabaseAdmin,
            startTime,
            includeDescriptions
        );

        // MEJORADO: Fusionar con datos existentes preservando configuración
        const listingsToUpsert = mergeWithExistingData(processedListings, existingData || [], preserveConfig);

        // Guardar en base de datos
        if (listingsToUpsert.length > 0) {
            console.log(`Guardando ${listingsToUpsert.length} publicaciones en BD...`);
            await saveListingsToDatabase(listingsToUpsert, supabaseAdmin);
        }

        const syncType = isFirstSync || forceFullSync ? 'complete' : 'incremental';
        const duration = (Date.now() - startTime) / 1000;
        
        return new Response(JSON.stringify({
            success: true,
            count: listingsToUpsert.length,
            sync_type: syncType,
            total_processed: listingIds.length,
            message: `${listingsToUpsert.length} publicaciones ${syncType === 'complete' ? 'sincronizadas' : 'nuevas agregadas'}`,
            duration: `${duration}s`,
            preserved_config: preserveConfig,
            included_descriptions: includeDescriptions
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error in sync function:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

async function getAllListingIds(meliUserId: string, accessToken: string, startTime: number): Promise<string[]> {
    const allListingIds: string[] = [];
    let scrollId: string | null = null;

    while (true) {
        if (Date.now() - startTime > 240000) {
            throw new Error("Execution time exceeded limit during ID fetching.");
        }

        let url = `https://api.mercadolibre.com/users/${meliUserId}/items/search?search_type=scan&limit=100`;
        if (scrollId) url += `&scroll_id=${scrollId}`;
        
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!response.ok) throw new Error("Failed to fetch listing IDs from ML.");

        const data = await response.json();
        const results = data.results;
        scrollId = data.scroll_id;

        if (!results || results.length === 0) break;
        
        allListingIds.push(...results);
        console.log(`Obtenidas ${allListingIds.length} IDs hasta ahora...`);
        
        if (!scrollId || results.length < 100) break;
    }

    return allListingIds;
}

// MEJORADA: Sincronización incremental más robusta
async function getNewListingIds(meliUserId: string, accessToken: string, existingData: any[]): Promise<string[]> {
    const existingMeliIds = new Set(existingData.map(item => item.meli_id));
    const newIds: string[] = [];
    
    // Buscar en múltiples páginas para ser más completo
    for (let offset = 0; offset < 200; offset += 50) {
        const url = `https://api.mercadolibre.com/users/${meliUserId}/items/search?limit=50&offset=${offset}&sort=date_desc`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!response.ok) {
            console.warn(`Error fetching page ${offset/50 + 1}, continuing...`);
            continue;
        }

        const data = await response.json();
        const pageIds = data.results || [];
        
        if (pageIds.length === 0) break;

        const pageNewIds = pageIds.filter((id: string) => !existingMeliIds.has(id));
        newIds.push(...pageNewIds);
        
        // Si una página completa ya existe, probablemente no hay más nuevos
        if (pageNewIds.length === 0) break;
        
        console.log(`Página ${offset/50 + 1}: ${pageNewIds.length} nuevas de ${pageIds.length} revisadas`);
    }
    
    console.log(`Encontradas ${newIds.length} publicaciones nuevas en total`);
    return newIds;
}

async function processListingDetails(
    listingIds: string[], 
    accessToken: string, 
    userId: string, 
    syncTime: string,
    supabaseAdmin: SupabaseClient,
    startTime: number,
    includeDescriptions: boolean = false
): Promise<any[]> {
    const CHUNK_SIZE = 20;
    const rawMeliData: any[] = [];
    
    // ✅ ARREGLADO: Incluir descriptions en attributesToFetch
    let attributesToFetch = 'id,title,price,variations,attributes,permalink,available_quantity,sold_quantity,status,listing_type_id,thumbnail,pictures';
    if (includeDescriptions) {
        attributesToFetch += ',descriptions';
    }

    // Obtener detalles de ML en lotes
    for (let i = 0; i < listingIds.length; i += CHUNK_SIZE) {
        if (Date.now() - startTime > 240000) {
            console.warn("Execution time nearing limit. Proceeding with partial data.");
            break;
        }
        
        const chunk = listingIds.slice(i, i + CHUNK_SIZE);
        const itemsDetailsResponse = await fetch(
            `https://api.mercadolibre.com/items?ids=${chunk.join(',')}&attributes=${attributesToFetch}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (itemsDetailsResponse.ok) {
            const itemsChunk = await itemsDetailsResponse.json();
            if (Array.isArray(itemsChunk)) rawMeliData.push(...itemsChunk);
        }
        
        console.log(`Procesando detalles: ${Math.min(i + CHUNK_SIZE, listingIds.length)}/${listingIds.length}`);
    }

    // Extraer todos los SKUs únicos para lookup batch
    const allSkus = new Set<string>();
    for (const itemWrapper of rawMeliData) {
        if (!itemWrapper.body || itemWrapper.code !== 200) continue;
        const body = itemWrapper.body;

        if (body.variations && body.variations.length > 0) {
            for (const variation of body.variations) {
                const sku = extractSku(body.attributes, variation.attributes, variation.seller_custom_field);
                if (sku) allSkus.add(sku);
            }
        } else {
            const sku = extractSku(body.attributes, undefined, body.seller_custom_field);
            if (sku) allSkus.add(sku);
        }
    }

    // Lookup batch de productos
    const productMap = await findProductBySkuBatch(supabaseAdmin, Array.from(allSkus), userId);

    // Procesar datos
    const processedListings: any[] = [];

    for (const itemWrapper of rawMeliData) {
        if (!itemWrapper.body || itemWrapper.code !== 200) continue;
        const body = itemWrapper.body;

        // ✅ ARREGLADO: Extraer descripción si está disponible
        const description = body.descriptions?.[0]?.plain_text || null;

        if (body.variations && body.variations.length > 0) {
            for (const variation of body.variations) {
                const sku = extractSku(body.attributes, variation.attributes, variation.seller_custom_field);
                
                if (sku) {
                    const productInfo = productMap.get(sku);
                    
                    processedListings.push({
                        user_id: userId,
                        meli_id: body.id,
                        meli_variation_id: variation.id,
                        title: `${body.title} (${variation.attribute_combinations.map((attr: any) => attr.value_name).join(' - ')})`,
                        sku: sku,
                        price: variation.price || body.price,
                        available_quantity: variation.available_quantity,
                        permalink: body.permalink,
                        sold_quantity: variation.sold_quantity,
                        last_synced_at: syncTime,
                        status: body.status,
                        listing_type_id: body.listing_type_id,
                        thumbnail_url: body.thumbnail,
                        pictures: body.pictures,
                        description: description, // ✅ NUEVO: Incluir descripción
                        product_id: productInfo?.id || null,
                        safety_stock: productInfo?.safety_stock || 0 // ✅ MEJORADO: Default 0 en lugar de null
                    });
                }
            }
        } else {
            const sku = extractSku(body.attributes, undefined, body.seller_custom_field);
            
            if (sku) {
                const productInfo = productMap.get(sku);
                
                processedListings.push({
                    user_id: userId,
                    meli_id: body.id,
                    meli_variation_id: null,
                    title: body.title,
                    sku: sku,
                    price: body.price,
                    available_quantity: body.available_quantity,
                    permalink: body.permalink,
                    sold_quantity: body.sold_quantity,
                    last_synced_at: syncTime,
                    status: body.status,
                    listing_type_id: body.listing_type_id,
                    thumbnail_url: body.thumbnail,
                    pictures: body.pictures,
                    description: description, // ✅ NUEVO: Incluir descripción
                    product_id: productInfo?.id || null,
                    safety_stock: productInfo?.safety_stock || 0 // ✅ MEJORADO: Default 0 en lugar de null
                });
            }
        }
    }

    return processedListings;
}

// ✅ MEJORADA: Preservar configuración del usuario, especialmente safety_stock
function mergeWithExistingData(processedListings: any[], existingData: any[], preserveConfig: boolean = false): any[] {
    const existingDataMap = new Map();
    
    for (const item of existingData) {
        const key = `${item.meli_id}-${item.meli_variation_id || 'null'}`;
        existingDataMap.set(key, item);
    }

    return processedListings.map(listing => {
        const key = `${listing.meli_id}-${listing.meli_variation_id || 'null'}`;
        const existingItem = existingDataMap.get(key);

        if (existingItem && preserveConfig) {
            // MODO PRESERVAR: Mantener toda la configuración del usuario
            return {
                ...listing,
                prodflow_stock: existingItem.prodflow_stock || listing.available_quantity,
                prodflow_price: existingItem.prodflow_price || listing.price,
                sync_enabled: existingItem.sync_enabled === false ? false : true,
                safety_stock: existingItem.safety_stock || listing.safety_stock || 0, // ✅ CRÍTICO: Preservar safety_stock
                // Preservar descripción existente si la nueva está vacía
                description: listing.description || existingItem.description || null
            };
        } else if (existingItem) {
            // MODO NORMAL: Actualizar datos de ML pero preservar configuración clave
            return {
                ...listing,
                prodflow_stock: existingItem.prodflow_stock,
                prodflow_price: existingItem.prodflow_price,
                sync_enabled: existingItem.sync_enabled === false ? false : true,
                safety_stock: existingItem.safety_stock || listing.safety_stock || 0, // ✅ CRÍTICO: Preservar safety_stock
                description: listing.description || existingItem.description || null
            };
        } else {
            // NUEVO ITEM: Usar valores por defecto
            return {
                ...listing,
                prodflow_stock: listing.available_quantity,
                prodflow_price: listing.price,
                sync_enabled: true,
                safety_stock: listing.safety_stock || 0 // ✅ MEJORADO: Asegurar default 0
            };
        }
    });
}

async function saveListingsToDatabase(listingsToUpsert: any[], supabaseAdmin: SupabaseClient): Promise<void> {
    const DB_CHUNK_SIZE = 500;
    
    for (let i = 0; i < listingsToUpsert.length; i += DB_CHUNK_SIZE) {
        const chunk = listingsToUpsert.slice(i, i + DB_CHUNK_SIZE);

        const { error: upsertError } = await supabaseAdmin
            .from('mercadolibre_listings')
            .upsert(chunk, { onConflict: 'user_id,meli_id,meli_variation_id' });
        
        if (upsertError) throw upsertError;
        
        console.log(`Guardado chunk ${i / DB_CHUNK_SIZE + 1} de ${Math.ceil(listingsToUpsert.length / DB_CHUNK_SIZE)}`);
    }
}