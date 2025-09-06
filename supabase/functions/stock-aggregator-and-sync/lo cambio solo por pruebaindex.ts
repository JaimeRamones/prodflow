// Ruta: supabase/functions/stock-aggregator-and-sync/index.ts
// VERSIÓN v22: Arquitectura de auto-invocación para procesos largos.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const GLOBAL_PAGE_SIZE = 1000;
const BATCH_SIZE = 150; // Puedes bajar este número (ej. a 100) si un lote sigue siendo muy lento
const MAX_STOCK_ALLOWED = 999999;
const MINIMUM_PRICE = 350.00;

// --- Funciones Auxiliares (Tus funciones originales) ---

function roundPrice(price: number): number { return Math.round(price * 100) / 100; }
function normalizeSku(sku: string | null): string | null {
    if (!sku) return null;
    return String(sku).trim();
}

async function getRefreshedToken(refreshToken: string, userId: string, supabaseClient: any) {
    const clientId = Deno.env.get('MELI_APP_ID');
    const clientSecret = Deno.env.get('MELI_SECRET_KEY');
    if (!clientId || !clientSecret) throw new Error('Falta configuración del servidor (App ID/Secret).');
    try {
        const response = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
        });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Fallo la solicitud a Mercado Libre. Status: ${response.status}. Respuesta: ${errorBody}`);
            throw new Error(`Error de API Meli (Status ${response.status}).`);
        }
        const data = await response.json();
        const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
        await supabaseClient.from('meli_credentials').update({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expires_at }).eq('user_id', userId);
        return data.access_token;
    } catch (error) {
        console.error("Excepción durante el refresco de token:", error);
        throw error;
    }
}

async function getLiveVariationId(meliId: string, listingSku: string, accessToken: string) {
    try {
        const response = await fetch(`https://api.mercadolibre.com/items/${meliId}?attributes=variations`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) return null;
        const data = await response.json();
        const variations = data.variations;
        if (!variations || variations.length === 0) return null;
        const matchingVariation = variations.find(v => {
            if (v.attributes && Array.isArray(v.attributes)) {
                const skuAttr = v.attributes.find(attr => attr.id === 'SELLER_SKU');
                if (skuAttr && normalizeSku(skuAttr.value_name) === listingSku) return true;
            }
            if (v.seller_custom_field && normalizeSku(v.seller_custom_field) === listingSku) return true;
            return false;
        });
        if (matchingVariation) return matchingVariation.id;
        if (variations.length === 1) return variations[0].id;
        return null;
    } catch (error) {
        return null;
    }
}

async function updateMeliItem(meliId: string, payload: any, accessToken: string, retries = 5, initialDelayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) return { success: true };
            const status = response.status;
            if ((status === 409 || status === 429) && i < retries - 1) {
                const waitTime = initialDelayMs * Math.pow(2, i);
                console.warn(`ADVERTENCIA: Conflicto (409/429) al actualizar ${meliId}. Reintentando (${i+1}/${retries}) en ${waitTime}ms...`);
                await delay(waitTime);
                continue;
            }
            const errorText = await response.text();
            console.error(`ERROR: Fallo definitivo al actualizar ${meliId}. Status: ${status}. Respuesta: ${errorText || '(vacía)'}`);
            return { success: false };
        } catch (networkError) {
            if (i < retries - 1) {
                 const waitTime = initialDelayMs * Math.pow(2, i);
                 await delay(waitTime);
                continue;
            }
            return { success: false };
        }
    }
    return { success: false };
}

async function fetchAllPaginated(table: string, select: string, userId: string) {
    let allData: any[] = [];
    let page = 0;
    let continueFetching = true;
    while (continueFetching) {
        let query = supabaseAdmin.from(table).select(select).range(page * GLOBAL_PAGE_SIZE, (page + 1) * GLOBAL_PAGE_SIZE - 1);
        if (table === 'products') {
            query = query.eq('user_id', userId);
        }
        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < GLOBAL_PAGE_SIZE) {
                continueFetching = false;
            } else {
                page++;
            }
        } else {
            continueFetching = false;
        }
    }
    return allData;
}

// --- Lógica Principal (Arquitectura v22) ---

serve(async (req) => {
  let currentPage = 0;
  try {
    const body = await req.json();
    currentPage = Number(body.page) || 0;

    console.log(`Iniciando AGREGADOR v22 - Procesando Lote ${currentPage + 1}...`);

    // --- Setup Inicial ---
    const { data: businessRulesData } = await supabaseAdmin.from('business_rules').select('user_id, config').eq('rule_type', 'Configuración General').limit(1).single();
    if (!businessRulesData || !businessRulesData.user_id) throw new Error("No se encontraron reglas de negocio.");
    const userId = businessRulesData.user_id;
    const rules = businessRulesData.config;
    const { data: tokenData } = await supabaseAdmin.from('meli_credentials').select('*').eq('user_id', userId).limit(1).single();
    if (!tokenData) throw new Error(`No se encontraron credenciales.`);
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date(Date.now() + 5 * 60000)) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, userId, supabaseAdmin);
    }
    const kitSuffixes = new Set<string>((rules.kitRules || []).map(r => normalizeSku(r.suffix)).filter(Boolean));
    const PREMIUM_SUFFIX = "-PR";

    // --- Agregación de Stock ---
    const [ownProducts, supplierStock] = await Promise.all([
      fetchAllPaginated('products', 'sku, cost_price, stock_disponible', userId),
      fetchAllPaginated('supplier_stock_items', 'sku, cost_price, quantity', userId)
    ]);
    const aggregatedStockMap = new Map<string, { stock: number; baseCost: number | null }>();
    (ownProducts || []).forEach(p => {
        const sku = normalizeSku(p.sku);
        if (sku) aggregatedStockMap.set(sku, { stock: p.stock_disponible || 0, baseCost: p.cost_price || null });
    });
    (supplierStock || []).forEach(s => {
        const sku = normalizeSku(s.sku);
        if (sku) {
            const existing = aggregatedStockMap.get(sku) || { stock: 0, baseCost: null };
            existing.stock += s.quantity || 0;
            if ((!existing.baseCost || existing.baseCost === 0) && s.cost_price) {
                existing.baseCost = s.cost_price;
            }
            aggregatedStockMap.set(sku, existing);
        }
    });

    // --- Procesar UN SOLO LOTE ---
    const { data: listingsBatch, error } = await supabaseAdmin
      .from('mercadolibre_listings')
      .select('id, meli_id, meli_variation_id, sku, price, available_quantity')
      .eq('user_id', userId)
      .eq('sync_enabled', true)
      .in('status', ['active', 'paused'])
      .range(currentPage * BATCH_SIZE, (currentPage + 1) * BATCH_SIZE - 1);

    if (error) throw error;
    if (!listingsBatch || listingsBatch.length === 0) {
        console.log('No se encontraron más publicaciones para procesar. Invocando kit-processor...');
        await supabaseAdmin.functions.invoke('kit-processor', { body: {} });
        return new Response(JSON.stringify({ success: true, message: "Proceso completado." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    const updatePromises = [];
    let skippedCount = 0;
    
    for (const listing of listingsBatch) {
        const listingSku = normalizeSku(listing.sku);
        if (!listingSku) continue;

        let isKitOrPremium = false;
        if (listingSku.endsWith(PREMIUM_SUFFIX)) { isKitOrPremium = true; }
        else { for (const suffix of kitSuffixes) { if (listingSku.endsWith(suffix)) { isKitOrPremium = true; break; } } }
        if (isKitOrPremium) continue;

        const baseData = aggregatedStockMap.get(listingSku);
        if (!baseData || !baseData.baseCost || !rules.defaultMarkup) { skippedCount++; continue; }

        const basePrice = baseData.baseCost * (1 + (rules.defaultMarkup / 100));
        const calculatedStock = baseData.stock > 0 ? baseData.stock : 0;
        let expectedStock = Math.min(calculatedStock, MAX_STOCK_ALLOWED);
        let expectedPrice = roundPrice(basePrice);
        if (expectedPrice < MINIMUM_PRICE && expectedPrice > 0) expectedPrice = MINIMUM_PRICE;

        const payload: { available_quantity?: number, price?: number } = {};
        let needsUpdate = false;
        if (listing.available_quantity !== expectedStock) { payload.available_quantity = expectedStock; needsUpdate = true; }
        if (Math.abs(listing.price - expectedPrice) > 0.01) { payload.price = expectedPrice; needsUpdate = true; }

        if (needsUpdate) {
            const promise = (async () => {
                let variationId = listing.meli_variation_id || await getLiveVariationId(listing.meli_id, listingSku, accessToken);
                const finalPayload = variationId ? { variations: [{ id: variationId, ...payload }] } : payload;
                const result = await updateMeliItem(listing.meli_id, finalPayload, accessToken);
                if (result.success) {
                    return {
                        meli_id: listing.meli_id,
                        user_id: userId,
                        price: expectedPrice,
                        available_quantity: expectedStock,
                        prodflow_price: expectedPrice,
                        prodflow_stock: expectedStock,
                        last_synced_at: new Date().toISOString(),
                        meli_variation_id: variationId || listing.meli_variation_id
                    };
                }
                return null;
            })();
            updatePromises.push(promise);
        }
    }

    if (updatePromises.length > 0) {
        console.log(`-> Enviando ${updatePromises.length} actualizaciones a Mercado Libre en paralelo...`);
        const results = await Promise.all(updatePromises);
        const localUpdates = results.filter(r => r !== null);

        if (localUpdates.length > 0) {
            console.log(`-> Actualizando localmente ${localUpdates.length} registros en Supabase (Lote ${currentPage+1})...`);
            const { error: updateError } = await supabaseAdmin
                .from('mercadolibre_listings')
                .upsert(localUpdates, { onConflict: 'user_id,meli_id' });
            if (updateError) {
                console.error("ERROR CRÍTICO: Falló la actualización local en lote.", updateError);
            }
        }
    }

    // --- LÓGICA DE DECISIÓN Y AUTO-INVOCACIÓN ---
    if (listingsBatch.length === BATCH_SIZE) {
      console.log(`Lote ${currentPage + 1} completado. Invocando el siguiente lote...`);
      // Invocamos la siguiente función en segundo plano (fire-and-forget)
      supabaseAdmin.functions.invoke('stock-aggregator-and-sync', {
        body: { page: currentPage + 1 },
      });
    } else {
      console.log('Todos los lotes de stock base han sido procesados. Invocando kit-processor...');
      supabaseAdmin.functions.invoke('kit-processor', { body: {} });
    }

    return new Response(JSON.stringify({ success: true, message: `Lote ${currentPage + 1} procesado.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`Error crítico en stock-aggregator-and-sync V22 (Lote ${currentPage}): ${error.message}`);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});