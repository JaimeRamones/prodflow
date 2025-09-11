// Ruta: supabase/functions/stock-aggregator-and-sync/index.ts
// VERSIÓN COMPATIBLE - Sin dependencia de syncControlId
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' 
};

const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '', 
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const BATCH_SIZE = 25;
const normalizeSku = (sku: string | null): string | null => 
    sku ? String(sku).trim().toUpperCase() : null;

async function getRefreshedToken(refreshToken: string, userId: string): Promise<string> {
    const clientId = Deno.env.get('MELI_APP_ID');
    const clientSecret = Deno.env.get('MELI_SECRET_KEY');
    
    if (!clientId || !clientSecret) {
        throw new Error('Configuración de MercadoLibre faltante');
    }
    
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken
        })
    });

    if (!response.ok) {
        throw new Error(`Error renovando token: ${response.status}`);
    }

    const data = await response.json();
    const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
    
    await supabaseAdmin
        .from('meli_credentials')
        .update({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: expires_at
        })
        .eq('user_id', userId);

    return data.access_token;
}

async function getLiveVariationId(meliId: string, listingSku: string, accessToken: string): Promise<string | null> {
    try {
        const response = await fetch(
            `https://api.mercadolibre.com/items/${meliId}?attributes=variations`, 
            {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }
        );
        
        if (!response.ok) return null;
        
        const data = await response.json();
        const variations = data.variations;
        
        if (!variations || variations.length === 0) return null;

        const matchingVariation = variations.find((v: any) => {
            if (v.attributes) {
                const skuAttr = v.attributes.find((attr: any) => attr.id === 'SELLER_SKU');
                if (skuAttr && normalizeSku(skuAttr.value_name) === listingSku) return true;
            }
            if (v.seller_custom_field) {
                if (normalizeSku(v.seller_custom_field) === listingSku) return true;
            }
            return false;
        });

        return matchingVariation ? matchingVariation.id : 
               (variations.length === 1 ? variations[0].id : null);
               
    } catch (error) {
        return null;
    }
}

async function updateMeliItem(meliId: string, payload: any, accessToken: string, retries = 3, initialDelayMs = 2000): Promise<{ success: boolean }> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) return { success: true };

            const status = response.status;
            const errorBody = await response.json().catch(() => null);

            if (status === 400) {
                console.error(`ERROR DE VALIDACIÓN en ${meliId}. Causa: ${JSON.stringify(errorBody, null, 2)}`);
                return { success: false };
            }

            if ((status === 429 || status === 403) && i < retries - 1) {
                const waitTime = initialDelayMs * Math.pow(2, i);
                console.warn(`WARN: Conflicto (${status}) al actualizar ${meliId}. Reintentando en ${waitTime / 1000}s...`);
                await delay(waitTime);
                continue;
            }
            
            console.error(`ERROR FINAL en ${meliId}. Status: ${status}. Causa: ${JSON.stringify(errorBody, null, 2)}`);
            return { success: false };

        } catch (networkError) {
            if (i < retries - 1) {
                await delay(initialDelayMs * Math.pow(2, i));
                continue;
            }
            console.error(`ERROR DE RED FINAL en ${meliId}:`, networkError.message);
            return { success: false };
        }
    }
    return { success: false };
}

serve(async (req) => {
    let page = 0;
    let userId = null;
    
    try {
        const body = await req.json();
        userId = body.userId;
        page = body.page || 0;
        
        if (!userId) {
            throw new Error("userId es requerido");
        }
        
        console.log(`Iniciando OBRERO DE SIMPLES (COMPATIBLE) para Usuario ${userId}, Lote ${page + 1}...`);
        
        // Verificar y renovar token
        const { data: tokenData } = await supabaseAdmin
            .from('meli_credentials')
            .select('access_token, refresh_token, expires_at')
            .eq('user_id', userId)
            .single();
            
        if (!tokenData) {
            throw new Error("No hay credenciales");
        }
        
        let accessToken = tokenData.access_token;
        if (new Date(tokenData.expires_at) < new Date(Date.now() + 5 * 60000)) {
            accessToken = await getRefreshedToken(tokenData.refresh_token, userId);
        }

        // Obtener reglas de negocio
        const { data: rulesData } = await supabaseAdmin
            .from('business_rules')
            .select('config')
            .single();
            
        const PREMIUM_SUFFIX = "-PR";
        let kitSuffixes = (rulesData?.config?.kitRules || [])
            .map((r: any) => r.suffix)
            .filter(Boolean);

        // Si no hay reglas o faltan sufijos, usar detección automática
        if (kitSuffixes.length === 0) {
            kitSuffixes = ["/X2", "/X3", "/X4", "/X5", "/X6", "/X8", "/X10", "/X12", "/X16", "/X24"];
        }
        
        console.log(`Excluyendo sufijos de kits: ${kitSuffixes.join(', ')}, ${PREMIUM_SUFFIX}`);

        // Crear filtros de exclusión para productos SIMPLES
        // Usar regex pattern para capturar cualquier /X + número
        const excludePatterns = [
            `sku.not.like.%${PREMIUM_SUFFIX}`,
            `sku.not.like.%/X%` // Excluye cualquier SKU que contenga /X
        ];
        const filterQuery = excludePatterns.join(',');

        // Obtener lote de listings
        const { data: listingsBatch, error } = await supabaseAdmin
            .from('mercadolibre_listings')
            .select('id, meli_id, meli_variation_id, sku, price, available_quantity')
            .eq('user_id', userId)
            .eq('sync_enabled', true)
            .or(filterQuery)
            .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

        if (error) throw error;

        // Obtener SKUs para buscar en cache
        const skusToFetch = (listingsBatch || [])
            .map(l => normalizeSku(l.sku))
            .filter(Boolean);

        // Verificar si terminamos
        if (skusToFetch.length === 0 && (!listingsBatch || listingsBatch.length < BATCH_SIZE)) {
            console.log(`Todos los lotes de simples completados. Pasando relevo a kit-processor.`);
            
            try {
                await supabaseAdmin.functions.invoke('kit-processor', { 
                    body: { userId, page: 0 } 
                });
                console.log("✅ kit-processor invocado exitosamente");
            } catch (error) {
                console.error("❌ Error invocando kit-processor:", error);
            }
            
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: `No hay más productos simples.` 
                }), 
                { headers: corsHeaders }
            );
        }

        // Obtener datos del cache
        const { data: cacheData } = await supabaseAdmin
            .from('sync_cache')
            .select('*')
            .in('sku', skusToFetch);
            
        const cacheMap = new Map((cacheData || []).map(item => [item.sku, item]));
        
        console.log(`Cache encontrado: ${cacheMap.size} registros de ${skusToFetch.length} solicitados`);

        // Procesar actualizaciones
        const updatePromises = [];
        for (const listing of (listingsBatch || [])) {
            const promise = (async () => {
                const listingSku = normalizeSku(listing.sku);
                const cached = cacheMap.get(listingSku);
                if (!cached) return null;

                const expectedPrice = cached.calculated_price;
                const expectedStock = cached.calculated_stock;

                const priceNeedsUpdate = Math.abs(listing.price - expectedPrice) > 0.01;
                const stockNeedsUpdate = listing.available_quantity !== expectedStock;

                if (priceNeedsUpdate || stockNeedsUpdate) {
                    const payload: { available_quantity?: number, price?: number } = {};
                    if (stockNeedsUpdate) payload.available_quantity = expectedStock;
                    if (priceNeedsUpdate) payload.price = expectedPrice;

                    let variationId: string | null = listing.meli_variation_id;
                    if (!variationId) {
                        variationId = await getLiveVariationId(listing.meli_id, listingSku, accessToken);
                    }
                    
                    const buildPayload = (vId: string | null) => 
                        vId ? { variations: [{ id: vId, ...payload }] } : { ...payload };
                        
                    const result = await updateMeliItem(listing.meli_id, buildPayload(variationId), accessToken);

                    if (result.success) {
                        return {
                            id: listing.id,
                            price: expectedPrice,
                            available_quantity: expectedStock,
                            prodflow_price: expectedPrice,
                            prodflow_stock: expectedStock,
                            last_synced_at: new Date().toISOString(),
                            meli_variation_id: variationId
                        };
                    }
                }
                return null;
            })();
            updatePromises.push(promise);
        }

        const results = await Promise.all(updatePromises);
        const successfulUpdates = results.filter(r => r !== null);
        
        if (successfulUpdates.length > 0) {
            console.log(`-> Actualizando localmente ${successfulUpdates.length} registros en Supabase...`);
            for (const updateData of successfulUpdates) {
                const { id, ...dataToUpdate } = updateData as any;
                await supabaseAdmin
                    .from('mercadolibre_listings')
                    .update(dataToUpdate)
                    .eq('id', id);
            }
        }

        // Programar siguiente lote o finalizar
        if (listingsBatch && listingsBatch.length === BATCH_SIZE) {
            console.log(`Lote ${page + 1} de simples completado. Pasando relevo al siguiente lote.`);
            await delay(1000);
            
            try {
                await supabaseAdmin.functions.invoke('stock-aggregator-and-sync', { 
                    body: { userId, page: page + 1 } 
                });
                console.log("✅ Siguiente lote programado exitosamente");
            } catch (error) {
                console.error("❌ ERROR programando siguiente lote:", error);
            }
        } else {
            console.log(`Todos los lotes de simples completados. Pasando relevo a kit-processor.`);
            
            try {
                await supabaseAdmin.functions.invoke('kit-processor', { 
                    body: { userId, page: 0 } 
                });
                console.log("✅ kit-processor invocado exitosamente");
            } catch (error) {
                console.error("❌ Error invocando kit-processor:", error);
            }
        }

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: `Lote ${page + 1} de simples completado.` 
            }), 
            { headers: corsHeaders }
        );

    } catch (error) {
        console.error(`Error fatal en OBRERO DE SIMPLES (Lote ${page}): ${error.message}`);
        return new Response(
            JSON.stringify({ error: error.message }), 
            { status: 500, headers: corsHeaders }
        );
    }
});