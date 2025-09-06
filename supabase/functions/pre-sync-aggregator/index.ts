// Ruta: supabase/functions/pre-sync-aggregator/index.ts
// VERSIÓN V32: Lógica de agregación invertida y robusta.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

const normalizeSku = (sku: string | null): string | null => sku ? String(sku).trim().toUpperCase() : null;
const roundPrice = (price: any): number => {
    const num = parseFloat(price);
    return isNaN(num) || num < 0 ? 0 : Math.round(num * 100) / 100;
};

async function fetchAllPaginated(table: string, select: string, userId: string) {
    let allData: any[] = [];
    let page = 0;
    const PAGE_SIZE = 1000;
    let keepFetching = true;

    while (keepFetching) {
        const { data, error } = await supabaseAdmin
            .from(table)
            .select(select)
            .eq('user_id', userId)
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            allData = allData.concat(data);
            page++;
        } else {
            keepFetching = false;
        }
    }
    return allData;
}


serve(async (req) => {
    try {
        const { userId } = await req.json();
        if (!userId) throw new Error("userId es requerido.");
        console.log(`Iniciando PRE-AGREGADOR V32 para Usuario ${userId}...`);

        await supabaseAdmin.from('sync_cache').delete().eq('user_id', userId);

        const { data: businessRulesData } = await supabaseAdmin.from('business_rules').select('config').eq('rule_type', 'Configuración General').single();
        if (!businessRulesData) throw new Error("No se encontraron reglas de negocio.");
        const rules = businessRulesData.config;

        const allProducts = await fetchAllPaginated('products', 'sku, cost_price, stock_disponible', userId);
        const supplierStock = await fetchAllPaginated('supplier_stock_items', 'sku, cost_price, quantity', userId);
        const allListings = await fetchAllPaginated('mercadolibre_listings', 'sku', userId);
        
        const aggregatedStockMap = new Map<string, { stock: number; cost: number }>();
        (allProducts || []).forEach(p => {
            const sku = normalizeSku(p.sku);
            if (sku) aggregatedStockMap.set(sku, { stock: p.stock_disponible || 0, cost: (p.cost_price && p.cost_price > 0) ? p.cost_price : 0 });
        });
        (supplierStock || []).forEach(s => {
            const sku = normalizeSku(s.sku);
            if (sku) {
                const existing = aggregatedStockMap.get(sku) || { stock: 0, cost: 0 };
                existing.stock += s.quantity || 0;
                if (s.cost_price && s.cost_price > 0) existing.cost = s.cost_price;
                aggregatedStockMap.set(sku, existing);
            }
        });

        const listingSkus = new Set((allListings || []).map(l => normalizeSku(l.sku)).filter(Boolean));
        
        const finalCache = [];
        const PREMIUM_SUFFIX = "-PR";
        const MINIMUM_PRICE = 350.00;
        const MAX_STOCK_ALLOWED = 999999;

        for (const [sku, data] of aggregatedStockMap.entries()) {
             if (data.cost > 0 && rules.defaultMarkup) {
                const simplePrice = data.cost * (1 + rules.defaultMarkup / 100);
                finalCache.push({ sku: sku, user_id: userId, calculated_stock: data.stock, calculated_price: simplePrice });

                const premiumSku = `${sku}${PREMIUM_SUFFIX}`;
                if (listingSkus.has(premiumSku) && rules.premiumMarkup) {
                    const premiumPrice = simplePrice * (1 + rules.premiumMarkup / 100);
                    finalCache.push({ sku: premiumSku, user_id: userId, calculated_stock: data.stock, calculated_price: premiumPrice });
                }
                
                (rules.kitRules || []).forEach((rule: any) => {
                    if(!rule.suffix) return;
                    const kitSku = `${sku}${rule.suffix}`;
                    if (listingSkus.has(kitSku)) {
                        const quantity = Number(rule.quantity);
                        if(quantity > 0){
                           const kitStock = Math.floor(data.stock / quantity);
                           const discount = Number(rule.discount) || 0;
                           const kitPrice = simplePrice * quantity * (1 - (discount / 100));
                           finalCache.push({ sku: kitSku, user_id: userId, calculated_stock: kitStock, calculated_price: kitPrice });
                        }
                    }
                });
             }
        }
        
        const processedCache = finalCache.map(item => ({
            ...item,
            calculated_stock: Math.min(Math.max(0, item.calculated_stock), MAX_STOCK_ALLOWED),
            calculated_price: item.calculated_price < MINIMUM_PRICE && item.calculated_price > 0 ? MINIMUM_PRICE : roundPrice(item.calculated_price)
        }));

        if (processedCache.length > 0) {
            const { error: cacheError } = await supabaseAdmin.from('sync_cache').insert(processedCache);
            if (cacheError) throw cacheError;
        }
        console.log(`Pre-agregador V32 completado. Se han cacheado ${processedCache.length} SKUs. Pasando relevo a stock-aggregator.`);
        
        supabaseAdmin.functions.invoke('stock-aggregator-and-sync', { body: { userId, page: 0 } })
            .catch(err => console.error(`Error al pasar relevo a stock-aggregator:`, err));

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    } catch (error) {
        console.error(`Error fatal en pre-sync-aggregator V32: ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
});