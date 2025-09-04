// Ruta: supabase/functions/kit-processor/index.ts
// VERSIÓN v19: Filtro de Estado Óptimo (Procesa 'active' y 'paused'). Mantiene arquitectura optimizada (Batch + Live Check + Limits + Flow Control).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Constantes de Configuración
const GLOBAL_PAGE_SIZE = 1000; // Para cargar stock
const BATCH_SIZE = 150;        // Para procesar publicaciones por lotes
const MAX_STOCK_ALLOWED = 999999; // Límite de Meli
const MINIMUM_PRICE = 350.00;     // Piso de precio Meli (Ajustar si es necesario)


// --- Funciones Auxiliares (Mismo código robusto de versiones anteriores) ---

function roundPrice(price: number): number {
    return Math.round(price * 100) / 100;
}

function normalizeSku(sku: string | null): string | null {
    if (!sku) return null;
    return String(sku).trim();
}

async function getRefreshedToken(refreshToken: string, userId: string, supabaseClient: any) {
    console.log(`Intentando refrescar token...`);
    const clientId = Deno.env.get('MELI_APP_ID');
    const clientSecret = Deno.env.get('MELI_SECRET_KEY');

    if (!clientId || !clientSecret) throw new Error('Falta configuración del servidor (App ID/Secret).');
    if (!refreshToken) throw new Error('El token de refresco almacenado es inválido.');

    try {
        const response = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
            body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Fallo la solicitud a Mercado Libre. Status: ${response.status}. Respuesta: ${errorBody}`);
            if (response.status >= 400 && response.status < 500) {
                 throw new Error(`Token inválido o expirado (Status ${response.status}). Se requiere re-autorización.`);
            }
            throw new Error(`Error de API Meli (Status ${response.status}).`);
        }

        const data = await response.json();
        const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
        await supabaseClient.from('meli_credentials').update({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expires_at }).eq('user_id', userId);
        console.log("Token refrescado exitosamente.");
        return data.access_token;
    } catch (error) {
        console.error("Excepción durante el refresco de token:", error);
        throw error; 
    }
}

// Verificación en Vivo de Variaciones
async function getLiveVariationId(meliId: string, listingSku: string, accessToken: string) {
    try {
        const response = await fetch(`https://api.mercadolibre.com/items/${meliId}?attributes=variations`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        const variations = data.variations;

        if (!variations || variations.length === 0) {
            return null; // Publicación simple
        }

        const matchingVariation = variations.find(v => {
            if (v.attributes && Array.isArray(v.attributes)) {
                const skuAttr = v.attributes.find(attr => attr.id === 'SELLER_SKU');
                return skuAttr && normalizeSku(skuAttr.value_name) === listingSku;
            }
            return false;
        });

        if (matchingVariation) {
            return matchingVariation.id;
        }

        if (variations.length === 1) {
            return variations[0].id;
        }

        console.warn(`DATA MISMATCH: No se encontró una variación coincidente por SKU para ${meliId} (${listingSku}) y hay múltiples opciones en vivo.`);
        return null;

    } catch (error) {
        console.error(`Error de red al obtener variaciones en vivo para ${meliId}.`);
        return null;
    }
}

// Actualización Robusta con Reintentos Exponenciales (Maneja 409/429)
async function updateMeliItem(meliId: string, payload: any, accessToken: string, retries = 5, initialDelayMs = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                return { success: true };
            }

            const status = response.status;

            // Reintento con espera exponencial para 409/429 (Saturación/Conflicto)
            if ((status === 409 || status === 429) && i < retries - 1) {
                const waitTime = initialDelayMs * Math.pow(2, i); // 1s, 2s, 4s, 8s...
                // Este log es una ADVERTENCIA de que se está reintentando, no un error fatal.
                console.warn(`ADVERTENCIA: Conflicto (409/429) al actualizar ${meliId}. Reintentando (${i+1}/${retries}) en ${waitTime}ms...`);
                await delay(waitTime);
                continue;
            }

            // Fallo definitivo (incluye 400 Bad Request)
            const errorText = await response.text();
            console.error(`ERROR: Fallo definitivo al actualizar ${meliId}. Status: ${status}. Respuesta: ${errorText || '(vacía)'}`);
            return { success: false };

        } catch (networkError) {
            console.error(`Error de red al actualizar ${meliId}:`, networkError);
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

// Paginación para Carga de Stock
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

// --- Lógica Principal (Arquitectura v19) ---

serve(async (_req) => {
  try {
    console.log(`Iniciando PROCESADOR DE KITS v19 (Filtro de Estado Óptimo)...`);
    
    // Paso 1: Setup Inicial
    const { data: businessRulesData } = await supabaseAdmin.from('business_rules').select('user_id, config').eq('rule_type', 'Configuración General').limit(1).single();
    if (!businessRulesData || !businessRulesData.user_id) throw new Error("No se encontraron reglas de negocio.");
    
    const userId = businessRulesData.user_id;
    const rules = businessRulesData.config;

    const { data: tokenData } = await supabaseAdmin.from('meli_credentials').select('*').eq('user_id', userId).limit(1).single();
    if (!tokenData) throw new Error(`No se encontraron credenciales de Mercado Libre.`);

    console.log("Paso 1: Verificando Token...");
    let accessToken = tokenData.access_token;
    const expirationThreshold = new Date(Date.now() + 5 * 60000);
    if (new Date(tokenData.expires_at) < expirationThreshold) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, userId, supabaseAdmin);
    }

    // Preparamos las reglas de kits
    const PREMIUM_SUFFIX = "-PR";
    const kitRulesMap = new Map<string, any>();
    if (rules.kitRules) {
        rules.kitRules.forEach(rule => {
            const cleanSuffix = rule.suffix ? normalizeSku(rule.suffix) : '';
            if (cleanSuffix) {
                kitRulesMap.set(cleanSuffix, rule);
            }
        });
    }


    // Paso 2: Carga y Agregación de Stock
    console.log("Paso 2: Iniciando Agregación de Stock (Propio + Proveedores)...");

    const ownProductsPromise = fetchAllPaginated('products', 'sku, cost_price, stock_disponible', userId);
    const supplierStockPromise = fetchAllPaginated('supplier_stock_items', 'sku, cost_price, quantity', userId);

    const [ownProducts, supplierStock] = await Promise.all([ownProductsPromise, supplierStockPromise]);
    
    // Lógica de Agregación
    const aggregatedStockMap = new Map<string, { stock: number; baseCost: number | null }>();

    (ownProducts || []).forEach(p => {
        const sku = normalizeSku(p.sku);
        if (sku) {
            aggregatedStockMap.set(sku, { stock: p.stock_disponible || 0, baseCost: p.cost_price || null });
        }
    });

    (supplierStock || []).forEach(s => {
        const sku = normalizeSku(s.sku);
        if (sku) {
            const existing = aggregatedStockMap.get(sku) || { stock: 0, baseCost: null };
            existing.stock += s.quantity || 0;
            if (!existing.baseCost && s.cost_price) {
                existing.baseCost = s.cost_price;
            }
            aggregatedStockMap.set(sku, existing);
        }
    });
    console.log(`Paso 2: Agregación completada. ${aggregatedStockMap.size} SKUs únicos disponibles.`);


    // Paso 3: Procesamiento por Lotes (¡NÚCLEO v19!)
    console.log("Paso 3: Iniciando Procesamiento por Lotes ('active' y 'paused')...");
    let page = 0;
    let continueProcessing = true;
    let updatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let totalProcessed = 0;

    while (continueProcessing) {
        console.log(`-> Cargando Lote ${page + 1} (Tamaño: ${BATCH_SIZE})...`);

        // Cargar el lote actual. ¡FILTRO ÓPTIMO v19!
        const { data: listingsBatch, error } = await supabaseAdmin
            .from('mercadolibre_listings')
            .select('meli_id, sku, price, available_quantity')
            .eq('user_id', userId)
            .eq('sync_enabled', true)
            .in('status', ['active', 'paused']) // <- Procesamos activas y pausadas (excluye under_review y closed)
            .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

        if (error) throw error;

        if (!listingsBatch || listingsBatch.length === 0) {
            continueProcessing = false;
            break;
        }

        console.log(`-> Procesando Lote ${page + 1} (${listingsBatch.length} items)...`);
        totalProcessed += listingsBatch.length;

        // --- Lógica de Procesamiento (Integrando todos los fixes) ---
        for (const listing of listingsBatch) {
            const listingSku = normalizeSku(listing.sku);
            if (!listingSku) continue;

            let baseSku = null;
            let rule = null;
            let isPremium = false;

            // 1. Identificar el tipo y SKU Base
            if (listingSku.endsWith(PREMIUM_SUFFIX)) {
                baseSku = listingSku.substring(0, listingSku.length - PREMIUM_SUFFIX.length);
                isPremium = true;
            } else {
                for (const [suffix, kitRule] of kitRulesMap.entries()) {
                    if (listingSku.endsWith(suffix)) {
                        baseSku = listingSku.substring(0, listingSku.length - suffix.length);
                        rule = kitRule;
                        break;
                    }
                }
            }

            if (!baseSku) continue;

            // 2. Obtener datos del SKU Base
            const baseData = aggregatedStockMap.get(baseSku);

            if (!baseData || !baseData.baseCost || !rules.defaultMarkup) {
                skippedCount++;
                continue;
            }

            // 3. Calcular Precio y Stock esperado
            const basePrice = baseData.baseCost * (1 + (rules.defaultMarkup / 100));
            let calculatedPrice = 0;
            let calculatedStock = 0;

            if (isPremium) {
                if (!rules.premiumMarkup) continue;
                calculatedPrice = roundPrice(basePrice * (1 + (rules.premiumMarkup / 100)));
                calculatedStock = baseData.stock;
            } else if (rule) {
                calculatedStock = Math.floor(baseData.stock / rule.quantity);
                calculatedPrice = roundPrice(basePrice * rule.quantity * (1 - (rule.discount / 100)));
            }

            if (calculatedStock < 0) calculatedStock = 0;

            // Aplicar Límites
            let expectedStock = Math.min(calculatedStock, MAX_STOCK_ALLOWED);
            let expectedPrice = calculatedPrice;
            // Solo aplicamos el mínimo si el precio no es cero
            if (expectedPrice < MINIMUM_PRICE && expectedPrice > 0) {
                expectedPrice = MINIMUM_PRICE;
            }


            // 4. Comparación y Actualización Integral
            const payload: { available_quantity?: number, price?: number } = {};
            let needsUpdate = false;

            // Comparamos con los valores locales guardados
            if (listing.available_quantity !== expectedStock) {
                payload.available_quantity = expectedStock;
                needsUpdate = true;
            }
            if (Math.abs(listing.price - expectedPrice) > 0.01) {
                payload.price = expectedPrice;
                needsUpdate = true;
            }

            if(needsUpdate) {
                
                // VERIFICACIÓN EN VIVO
                const liveVariationId = await getLiveVariationId(listing.meli_id, listingSku, accessToken);

                let finalPayload: any = {};

                if (liveVariationId) {
                    // Es publicación con Variaciones (confirmado en vivo)
                    const variationUpdate = { id: liveVariationId, ...payload };
                    finalPayload = { variations: [variationUpdate] };
                } else {
                    // Es publicación Simple (confirmado en vivo)
                    finalPayload = payload;
                }

                // Actualización Robusta
                const result = await updateMeliItem(listing.meli_id, finalPayload, accessToken);

                if (result.success) {
                    updatedCount++;
                } else {
                    failedCount++;
                }
                
                // Pausa base (Control de flujo)
                await delay(150); 
            }
        }
        // --- Fin Lógica de Procesamiento ---

        // Preparamos el siguiente lote
        if (listingsBatch.length < BATCH_SIZE) {
            continueProcessing = false;
        } else {
            page++;
            // Pequeña pausa entre lotes para liberar memoria
            await delay(500); 
        }
    }

    console.log(`Sincronización de kits finalizada. Total Procesado (Activas/Pausadas): ${totalProcessed}. Actualizados: ${updatedCount}. Fallidos (tras reintentos): ${failedCount}. Omitidos (sin stock/costo base): ${skippedCount}.`);
    return new Response(JSON.stringify({ success: true, message: `Sincro de KITS (v19) completada. Actualizados: ${updatedCount}. Fallidos: ${failedCount}.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  
  } catch (error) {
    console.error(`Error en kit-processor: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});