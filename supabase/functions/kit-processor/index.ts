// Ruta: supabase/functions/kit-processor/index.ts
// VERSIÓN v6: Con corrección de API Meli, paginación interna completa y limpieza de SKUs.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Función de Token (SIN CAMBIOS)
async function getRefreshedToken(refreshToken: string, userId: string, supabaseClient: any) {
    const clientId = Deno.env.get('MELI_APP_ID')!;
    const clientSecret = Deno.env.get('MELI_SECRET_KEY')!;
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
    });
    if (!response.ok) throw new Error('No se pudo refrescar el token de Mercado Libre.');
    const data = await response.json();
    const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
    await supabaseClient.from('meli_credentials').update({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expires_at }).eq('user_id', userId);
    return data.access_token;
}

const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const PAGE_SIZE = 1000;

// NUEVO: Función auxiliar para paginación interna
async function fetchAllPaginated(table: string, select: string, userId: string, filterSyncEnabled = false) {
    let allData: any[] = [];
    let page = 0;
    let continueFetching = true;

    while (continueFetching) {
        let query = supabaseAdmin
            .from(table)
            .select(select)
            .eq('user_id', userId)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        
        if (filterSyncEnabled) {
            query = query.eq('sync_enabled', true);
        }

        const { data, error } = await query;
        
        if (error) throw error;

        if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < PAGE_SIZE) {
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


serve(async (_req) => {
  try {
    console.log(`Iniciando PROCESADOR DE KITS v6 (API Corregida, Paginación y Limpieza)...`);
    
    // Paso 1: Obteniendo credenciales y reglas
    const { data: tokenData } = await supabaseAdmin.from('meli_credentials').select('*').limit(1).single();
    if (!tokenData) throw new Error(`No se encontraron credenciales.`);
    const userId = tokenData.user_id;

    const { data: businessRulesData } = await supabaseAdmin.from('business_rules').select('config').eq('user_id', userId).eq('rule_type', 'Configuración General').single();
    if (!businessRulesData) throw new Error("No se encontraron reglas de negocio (Configuración General).");
    const rules = businessRulesData.config;

    // Paso 1b: Obteniendo productos propios (CON PAGINACIÓN)
    console.log("Paso 1: Obteniendo datos (con paginación)...");
    const ownProducts = await fetchAllPaginated('products', 'sku, cost_price, stock_disponible', userId);
    console.log(`Paso 1: ${ownProducts.length} productos base cargados.`);


    // Paso 2: Generando productos virtuales
    console.log("Paso 2: Generando productos virtuales...");
    let allVirtualProducts = [];
    const generatedSkusSet = new Set<string>(); 

    (ownProducts || []).forEach(product => {
        // IMPORTANTE: Limpiamos el SKU base (.trim())
        const baseSku = product.sku ? String(product.sku).trim() : null;

        if (!baseSku || !product.cost_price || product.cost_price <= 0 || !product.stock_disponible || !rules.defaultMarkup) return;
        
        const basePrice = product.cost_price * (1 + (rules.defaultMarkup / 100));
        
        // Variante Premium
        if (rules.premiumMarkup) {
            const premiumSku = `${baseSku}-PR`;
            allVirtualProducts.push({ sku: premiumSku, price: parseFloat((basePrice * (1 + (rules.premiumMarkup / 100))).toFixed(2)), stock: product.stock_disponible });
            generatedSkusSet.add(premiumSku);
        }
        
        // Kits
        if (rules.kitRules) {
            rules.kitRules.forEach(rule => {
                const kitStock = Math.floor(product.stock_disponible / rule.quantity);
                if (kitStock > 0) {
                    const kitSku = `${baseSku}${rule.suffix}`;
                    allVirtualProducts.push({ sku: kitSku, price: parseFloat((basePrice * rule.quantity * (1 - (rule.discount / 100))).toFixed(2)), stock: kitStock });
                    generatedSkusSet.add(kitSku);
                }
            });
        }
    });
    console.log(`Paso 2: Generados ${allVirtualProducts.length} virtuales. (SKUs únicos: ${generatedSkusSet.size}).`);

    
    // Paso 3: Obteniendo publicaciones locales (CON PAGINACIÓN)
    console.log("Paso 3: Obteniendo publicaciones locales activas (con paginación)...");
    // Filtramos por sync_enabled = true
    const allListings = await fetchAllPaginated('mercadolibre_listings', 'meli_id, sku, price, available_quantity', userId, true);

    // Creando el Mapa de Publicaciones (listingsMap)
    // IMPORTANTE: Limpiamos el SKU de la publicación (.trim()) antes de mapear.
    const listingsMap = new Map<string, any>();
    allListings.forEach(l => {
        const cleanedSku = l.sku ? String(l.sku).trim() : null;
        if (cleanedSku) {
            listingsMap.set(cleanedSku, l);
        }
    });

    console.log(`Paso 3: Se cargaron ${allListings.length} publicaciones activas. Mapeadas: ${listingsMap.size}.`);

    // --- DIAGNÓSTICO DE COINCIDENCIA (Logs) ---
    let matchCount = 0;
    generatedSkusSet.forEach(generatedSku => {
        if (listingsMap.has(generatedSku)) {
            matchCount++;
        }
    });
    console.log(`Diagnóstico: ${matchCount} de ${generatedSkusSet.size} SKUs virtuales tienen coincidencia.`);
    // -------------------------------------


    // Paso 4: Preparación de Token
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, userId, supabaseAdmin);
    }

    // Paso 5: Comparación y Actualización
    console.log(`Paso 5: Iniciando comparación y actualización...`);
    let updatedCount = 0;
    for (const virtualProduct of allVirtualProducts) {
        const listingToUpdate = listingsMap.get(virtualProduct.sku);
        
        if (!listingToUpdate) continue;
        
        const payload: { available_quantity?: number, price?: number } = {};
        let needsUpdate = false;
        if (listingToUpdate.available_quantity !== virtualProduct.stock) {
             payload.available_quantity = virtualProduct.stock;
             needsUpdate = true;
        }
        if (Math.abs(listingToUpdate.price - virtualProduct.price) > 0.01) {
            payload.price = virtualProduct.price;
            needsUpdate = true;
        }

        if(needsUpdate) {
            console.log(`-> ACTUALIZANDO ${listingToUpdate.meli_id} (${virtualProduct.sku}) con:`, payload);
            
            // ¡¡¡CORRECCIÓN CRÍTICA!!! El payload para Mercado Libre debe ser simple {price: X, available_quantity: Y}.
            const response = await fetch(`https://api.mercadolibre.com/items/${listingToUpdate.meli_id}`, {
                method: 'PUT', 
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) // Payload corregido
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Fallo al actualizar ${listingToUpdate.meli_id}. Status: ${response.status}. Respuesta: ${errorText || '(vacía)'}`);
            } else { 
                updatedCount++;
            }
            // Pausa para no saturar la API de Meli
            await delay(200); 
        }
    }
    console.log(`Sincronización de kits finalizada. ${updatedCount} items fueron actualizados.`);
    return new Response(JSON.stringify({ success: true, message: `Sincro de KITS completada. ${updatedCount} items actualizados. Coincidencias encontradas: ${matchCount}.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  
  } catch (error) {
    console.error(`Error en kit-processor: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});