// VERSIÓN FINAL v5: Con diagnóstico avanzado y autocontenida
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

serve(async (_req) => {
  try {
    console.log(`Iniciando PROCESADOR DE KITS v5 (diagnóstico avanzado)...`);
    
    console.log("Paso 1: Obteniendo datos...");
    const { data: ownProducts } = await supabaseAdmin.from('products').select(`sku, cost_price, stock_disponible`);
    const { data: tokenData } = await supabaseAdmin.from('meli_credentials').select('*').limit(1).single();
    if (!tokenData) throw new Error(`No se encontraron credenciales.`);
    const { data: businessRulesData } = await supabaseAdmin.from('business_rules').select('config').eq('user_id', tokenData.user_id).eq('rule_type', 'Configuración General').single();
    if (!businessRulesData) throw new Error("No se encontraron reglas de negocio.");
    const rules = businessRulesData.config;
    console.log("Paso 1: Datos obtenidos.");

    console.log("Paso 2: Generando productos virtuales...");
    let allVirtualProducts = [];
    (ownProducts || []).forEach(product => {
        if (!product.cost_price || product.cost_price <= 0 || !product.stock_disponible || !rules.defaultMarkup) return;
        const basePrice = product.cost_price * (1 + (rules.defaultMarkup / 100));
        if (rules.premiumMarkup) {
            allVirtualProducts.push({ sku: `${product.sku}-PR`, price: parseFloat((basePrice * (1 + (rules.premiumMarkup / 100))).toFixed(2)), stock: product.stock_disponible });
        }
        if (rules.kitRules) {
            rules.kitRules.forEach(rule => {
                const kitStock = Math.floor(product.stock_disponible / rule.quantity);
                if (kitStock > 0) {
                    allVirtualProducts.push({ sku: `${product.sku}${rule.suffix}`, price: parseFloat((basePrice * rule.quantity * (1 - (rule.discount / 100))).toFixed(2)), stock: kitStock });
                }
            });
        }
    });
    console.log(`Se generaron ${allVirtualProducts.length} productos virtuales.`);
    
    console.log("Paso 3: Obteniendo publicaciones de la base de datos local...");
    const { data: allListings, error: listingError } = await supabaseAdmin.from('mercadolibre_listings').select('meli_id, sku, price, available_quantity, sync_enabled').filter('sync_enabled', 'eq', true);
    if (listingError) throw new Error(`Error al obtener publicaciones: ${listingError.message}`);
    if (!allListings) throw new Error("La tabla de publicaciones está vacía o no se pudo cargar.");
    const listingsMap = new Map(allListings.map(l => [l.sku, l]));
    console.log(`Paso 3: Se cargaron ${listingsMap.size} publicaciones locales.`);
    
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, tokenData.user_id, supabaseAdmin);
    }

    console.log(`Paso 4: Iniciando comparación para ${allVirtualProducts.length} kits...`);
    let updatedCount = 0;
    for (const virtualProduct of allVirtualProducts) {
        const listingToUpdate = listingsMap.get(virtualProduct.sku);
        if (!listingToUpdate) {
            // Este log nos dirá si no encuentra el SKU
            // console.log(`> No se encontró publicación para el SKU virtual: ${virtualProduct.sku}`);
            continue;
        }
        
        console.log(`> Comparando SKU: ${virtualProduct.sku} | Precio Nuevo: ${virtualProduct.price} vs. Viejo: ${listingToUpdate.price} | Stock Nuevo: ${virtualProduct.stock} vs. Viejo: ${listingToUpdate.available_quantity}`);
        
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
            console.log(`-> ACTUALIZANDO ${listingToUpdate.meli_id} con:`, payload);
            const response = await fetch(`https://api.mercadolibre.com/items/${listingToUpdate.meli_id}`, {
                method: 'PUT', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ attributes: Object.entries(payload).map(([key, value]) => ({ id: key.toUpperCase(), value_name: value })) })
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Fallo al actualizar ${listingToUpdate.meli_id}. Status: ${response.status}. Respuesta: ${errorText || '(vacía)'}`);
            } else { 
                updatedCount++;
                console.log(`Publicación ${listingToUpdate.meli_id} actualizada.`);
            }
            await delay(500);
        }
    }
    console.log(`Sincronización de kits finalizada. ${updatedCount} items fueron actualizados.`);
    return new Response(JSON.stringify({ success: true, message: `Sincro de KITS completada. ${updatedCount} items actualizados.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (error) {
    console.error(`Error en kit-processor: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});