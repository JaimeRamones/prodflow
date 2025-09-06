// Ruta: supabase/functions/kit-processor/index.ts
// VERSIÓN V32.2: Obrero de Kits con todas las funciones auxiliares corregidas y completas.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const BATCH_SIZE = 50;

// --- INICIO DE FUNCIONES AUXILIARES COMPLETAS Y CORRECTAS ---
const normalizeSku = (sku: string | null): string | null => sku ? String(sku).trim().toUpperCase() : null;

async function getRefreshedToken(refreshToken: string, userId: string, supabaseClient: any): Promise<string> {
    const clientId = Deno.env.get('MELI_APP_ID');
    const clientSecret = Deno.env.get('MELI_SECRET_KEY');
    if (!clientId || !clientSecret) throw new Error('Falta configuración del servidor.');
    const response = await fetch('https://api.mercadolibre.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }), });
    if (!response.ok) throw new Error(`Error de API Meli (Status ${response.status}).`);
    const data = await response.json();
    const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
    await supabaseClient.from('meli_credentials').update({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expires_at }).eq('user_id', userId);
    return data.access_token;
}

async function getLiveVariationId(meliId: string, listingSku: string, accessToken: string): Promise<string | null> {
    try {
        const response = await fetch(`https://api.mercadolibre.com/items/${meliId}?attributes=variations`, { method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (!response.ok) return null;
        const data = await response.json();
        const variations = data.variations;
        if (!variations || variations.length === 0) return null;
        const matchingVariation = variations.find((v: any) => {
            if (v.attributes) { const skuAttr = v.attributes.find((attr: any) => attr.id === 'SELLER_SKU'); if (skuAttr && normalizeSku(skuAttr.value_name) === listingSku) return true; }
            if (v.seller_custom_field) if (normalizeSku(v.seller_custom_field) === listingSku) return true;
            return false;
        });
        return matchingVariation ? matchingVariation.id : (variations.length === 1 ? variations[0].id : null);
    } catch (error) { return null; }
}

async function updateMeliItem(meliId: string, payload: any, accessToken: string, retries = 3, initialDelayMs = 1500): Promise<{ success: boolean }> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(`https://api.mercadolibre.com/items/${meliId}`, { method: 'PUT', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (response.ok) return { success: true };
            const status = response.status;
            const errorBody = await response.json().catch(() => null);
            if (status === 400 && errorBody?.cause?.some((c: any) => c.code === 'item.price.invalid')) {
                const cause = errorBody.cause.find((c: any) => c.code === 'item.price.invalid');
                const match = cause.message.match(/\$ (\d+)/);
                if (match && match[1]) {
                    const minPrice = parseInt(match[1], 10);
                    console.warn(`WARN: Precio bajo para ${meliId}. Meli exige > $${minPrice}. Reintentando con el precio mínimo.`);
                    const newPayload = JSON.parse(JSON.stringify(payload));
                    if (newPayload.variations && newPayload.variations.length > 0) newPayload.variations[0].price = minPrice;
                    else newPayload.price = minPrice;
                    const retryResponse = await fetch(`https://api.mercadolibre.com/items/${meliId}`, { method: 'PUT', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(newPayload) });
                    if (retryResponse.ok) return { success: true };
                }
            }
            if ((status === 409 || status === 429) && i < retries - 1) {
                await delay(initialDelayMs * Math.pow(2, i));
                continue;
            }
            console.error(`ERROR FINAL en ${meliId}. Status: ${status}. Causa: ${JSON.stringify(errorBody, null, 2)}`);
            return { success: false };
        } catch (networkError) {
            if (i < retries - 1) {
                await delay(initialDelayMs * Math.pow(2, i));
                continue;
            }
            return { success: false };
        }
    }
    return { success: false };
}
// --- FIN DE FUNCIONES AUXILIARES ---

serve(async (req) => {
    let page = 0;
    let userId = null;
    try {
        const body = await req.json();
        userId = body.userId;
        page = body.page || 0;
        if (!userId) throw new Error("userId es requerido.");
        
        console.log(`Iniciando OBRERO DE KITS (V32.2) para Usuario ${userId}, Lote ${page + 1}...`);
        
        const { data: tokenData } = await supabaseAdmin.from('meli_credentials').select('access_token, refresh_token, expires_at').eq('user_id', userId).single();
        if (!tokenData) throw new Error("No hay credenciales");
        let accessToken = tokenData.access_token;
        if (new Date(tokenData.expires_at) < new Date(Date.now() + 5 * 60000)) {
            accessToken = await getRefreshedToken(tokenData.refresh_token, userId, supabaseAdmin);
        }

        const { data: businessRulesData } = await supabaseAdmin.from('business_rules').select('config').eq('rule_type', 'Configuración General').single();
        if (!businessRulesData) throw new Error("No se encontraron reglas de negocio.");
        const rules = businessRulesData.config;
        
        const PREMIUM_SUFFIX = "-PR";
        const kitSuffixes = (rules.kitRules || []).map((r: any) => r.suffix).filter(Boolean);
        const filterConditions = kitSuffixes.map((s: string) => `sku.like.%${s}`);
        filterConditions.push(`sku.like.%${PREMIUM_SUFFIX}`);
        const filterString = filterConditions.join(',');
        
        const { data: listingsBatch, error } = await supabaseAdmin
            .from('mercadolibre_listings')
            .select('id, meli_id, meli_variation_id, sku, price, available_quantity')
            .eq('user_id', userId)
            .eq('sync_enabled', true)
            .or(filterString)
            .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

        if (error) throw error;

        const skusToFetch = (listingsBatch || []).map(l => normalizeSku(l.sku)).filter(Boolean);
        if (skusToFetch.length === 0 && (!listingsBatch || listingsBatch.length < BATCH_SIZE)) {
             console.log(`Todos los lotes de kits completados. Pasando relevo a status-activator.`);
             supabaseAdmin.functions.invoke('status-activator', { body: { userId, page: 0 } }).catch();
             return new Response(JSON.stringify({ success: true, message: `No hay más kits para procesar.` }), { headers: corsHeaders });
        }

        const { data: cacheData } = await supabaseAdmin.from('sync_cache').select('*').in('sku', skusToFetch);
        const cacheMap = new Map((cacheData || []).map(item => [item.sku, item]));

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
                    if (!variationId) variationId = await getLiveVariationId(listing.meli_id, listingSku, accessToken);
                    
                    const buildPayload = (vId: string | null) => vId ? { variations: [{ id: vId, ...payload }] } : { ...payload };
                    const result = await updateMeliItem(listing.meli_id, buildPayload(variationId), accessToken);

                    if (result.success) {
                        return { id: listing.id, price: expectedPrice, available_quantity: expectedStock, prodflow_price: expectedPrice, prodflow_stock: expectedStock, last_synced_at: new Date().toISOString(), meli_variation_id: variationId };
                    }
                }
                return null;
            })();
            updatePromises.push(promise);
        }

        const results = await Promise.all(updatePromises);
        const successfulUpdates = results.filter(r => r !== null);
        
        if (successfulUpdates.length > 0) {
            console.log(`-> Actualizando localmente ${successfulUpdates.length} registros de kits en Supabase...`);
            for (const updateData of successfulUpdates) {
                const { id, ...dataToUpdate } = updateData as any;
                await supabaseAdmin.from('mercadolibre_listings').update(dataToUpdate).eq('id', id);
            }
        }

        if (listingsBatch && listingsBatch.length === BATCH_SIZE) {
            console.log(`Lote ${page + 1} de kits completado. Pasando relevo al siguiente lote.`);
            supabaseAdmin.functions.invoke('kit-processor', { body: { userId, page: page + 1 } }).catch();
        } else {
            console.log(`Todos los lotes de kits completados. Pasando relevo a status-activator.`);
            supabaseAdmin.functions.invoke('status-activator', { body: { userId, page: 0 } }).catch();
        }

        return new Response(JSON.stringify({ success: true, message: `Lote ${page + 1} de kits completado.` }), { headers: corsHeaders });
    } catch (error) {
        console.error(`Error fatal en OBRERO DE KITS V32.2 (Lote ${page}): ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
});