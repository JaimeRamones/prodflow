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

const BATCH_SIZE = 2000;
const defaultMarkup = 80; // Markup global por defecto

const normalizeSku = (sku: string | null): string | null => 
    sku ? sku.trim() : null; // Solo quitamos espacios al inicio/final

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log('🚀 Iniciando pre-sync-aggregator con solución temporal...');
        
        // Limpiar tabla sync_cache
        console.log('🧹 Limpiando tabla sync_cache...');
        await supabaseAdmin.from('sync_cache').delete().neq('id', 0);
        
        // 1. Obtener todos los supplier_stock_items
        console.log('📦 Obteniendo supplier_stock_items...');
        const { data: supplierItems, error: supplierError } = await supabaseAdmin
            .from('supplier_stock_items')
            .select('sku, cost_price, quantity, warehouse_id');
            
        if (supplierError) throw supplierError;
        console.log(`✅ Supplier items obtenidos: ${supplierItems?.length || 0}`);

        // 2. Obtener todos los productos del inventario
        console.log('📋 Obteniendo productos del inventario...');
        const { data: inventoryItems, error: inventoryError } = await supabaseAdmin
            .from('products')
            .select('sku, cost_price');
            
        if (inventoryError) throw inventoryError;
        console.log(`✅ Inventory items obtenidos: ${inventoryItems?.length || 0}`);

        // 3. Obtener configuración de markups por proveedor
        console.log('⚙️ Obteniendo configuración de suppliers...');
        const { data: suppliers, error: suppliersError } = await supabaseAdmin
            .from('suppliers')
            .select('id, markup');
            
        if (suppliersError) throw suppliersError;
        
        const supplierMarkupMap = new Map();
        suppliers?.forEach(supplier => {
            supplierMarkupMap.set(supplier.id, supplier.markup || defaultMarkup);
        });
        console.log(`✅ Suppliers configurados: ${suppliers?.length || 0}`);

        // 4. Obtener warehouses para mapear supplier_id
        console.log('🏢 Obteniendo warehouses...');
        const { data: warehouses, error: warehousesError } = await supabaseAdmin
            .from('warehouses')
            .select('id, supplier_id');
            
        if (warehousesError) throw warehousesError;
        
        const warehouseSupplierMap = new Map();
        warehouses?.forEach(warehouse => {
            warehouseSupplierMap.set(warehouse.id, warehouse.supplier_id);
        });

        // Crear mapas para búsqueda rápida
        console.log('🗺️ Creando mapas de búsqueda...');
        const supplierItemsMap = new Map();
        const inventoryItemsMap = new Map();
        
        // Mapear items de proveedores
        supplierItems?.forEach(item => {
            const normalizedSku = normalizeSku(item.sku);
            if (normalizedSku) {
                supplierItemsMap.set(normalizedSku, item);
            }
        });
        
        // Mapear items de inventario
        inventoryItems?.forEach(item => {
            const normalizedSku = normalizeSku(item.sku);
            if (normalizedSku) {
                inventoryItemsMap.set(normalizedSku, item);
            }
        });
        
        console.log(`📊 Supplier items mapeados: ${supplierItemsMap.size}`);
        console.log(`📊 Inventory items mapeados: ${inventoryItemsMap.size}`);
        
        // DEBUG: Verificar si SKUs específicos están en ambos mapas
        const testSkus = ['ACONTI   CT 1126', 'AJOHNSON 2802A1'];
        console.log('🔍 DEBUG - Verificando SKUs específicos:');
        testSkus.forEach(sku => {
            const normalized = normalizeSku(sku);
            const supplierItem = supplierItemsMap.get(normalized);
            const inventoryItem = inventoryItemsMap.get(normalized);
            console.log(`🔍 SKU: "${sku}"`);
            console.log(`   - Normalized: "${normalized}"`);
            console.log(`   - In supplier map: ${supplierItemsMap.has(normalized)} ${supplierItem ? `(qty: ${supplierItem.quantity}, warehouse: ${supplierItem.warehouse_id})` : ''}`);
            console.log(`   - In inventory map: ${inventoryItemsMap.has(normalized)} ${inventoryItem ? `(cost: ${inventoryItem.cost_price})` : ''}`);
            
            // DEBUG adicional: buscar variaciones del SKU en el mapa
            console.log(`   - Buscando variaciones en supplier map:`);
            let found = false;
            for (let [mapSku, mapItem] of supplierItemsMap) {
                if (mapSku.includes('ACONTI') && sku.includes('ACONTI')) {
                    console.log(`     * Encontrado variación: "${mapSku}" (original: "${mapItem.sku}")`);
                    found = true;
                }
                if (mapSku.includes('AJOHNSON') && sku.includes('AJOHNSON')) {
                    console.log(`     * Encontrado variación: "${mapSku}" (original: "${mapItem.sku}")`);
                    found = true;
                }
            }
            if (!found) {
                console.log(`     * No se encontraron variaciones para ${sku}`);
            }
        });
        
        // DEBUG: Mostrar algunos SKUs de supplier_stock_items
        console.log('🔍 Primeros 5 SKUs en supplier map:');
        let debugCount = 0;
        for (let [sku, item] of supplierItemsMap) {
            if (debugCount < 5) {
                console.log(`   - "${sku}" (warehouse: ${item.warehouse_id}, qty: ${item.quantity})`);
                debugCount++;
            }
        }

        // Crear conjunto único de todos los SKUs
        const allSkus = new Set([
            ...Array.from(supplierItemsMap.keys()),
            ...Array.from(inventoryItemsMap.keys())
        ]);

        console.log(`🎯 Total SKUs únicos a procesar: ${allSkus.size}`);

        const syncCacheData: any[] = [];
        let processedCount = 0;

        // Procesar cada SKU único
        for (const normalizedSku of allSkus) {
            const originalSku = normalizedSku; // Ya está normalizado
            
            const supplierItem = supplierItemsMap.get(normalizedSku);
            const inventoryItem = inventoryItemsMap.get(normalizedSku);
            
            // DEBUG específico para SKUs problemáticos
            if (originalSku.includes('ACONTI') || originalSku.includes('AJOHNSON')) {
                console.log(`🔍 DEBUG "${originalSku}":
                  - Normalized: "${normalizedSku}"
                  - Supplier found: ${!!supplierItem} ${supplierItem ? `(warehouse_id: ${supplierItem.warehouse_id})` : ''}
                  - Inventory found: ${!!inventoryItem} ${inventoryItem ? `(warehouse_id: ${inventoryItem.warehouse_id})` : ''}`);
            }
            
            let warehouse_id = null;
            let supplier_id = null; 
            let markup = defaultMarkup;
            let source = 'undefined';
            let totalStock = 0;

            // LÓGICA DE PRIORIZACIÓN
            if (supplierItem && inventoryItem) {
                // SKU existe en ambos lugares: usar proveedor + sumar stock
                warehouse_id = supplierItem.warehouse_id;
                supplier_id = warehouseSupplierMap.get(warehouse_id);
                markup = supplierMarkupMap.get(supplier_id) || defaultMarkup;
                totalStock = (supplierItem.quantity || 0) + (inventoryItem.quantity || 0);
                source = 'both';
                
                // Log específico para casos "both"
                if (originalSku.includes('ACONTI') || originalSku.includes('AJOHNSON')) {
                    console.log(`✅ SKU ${originalSku}: warehouse_id: ${warehouse_id}, supplier_id: ${supplier_id}, markup: ${markup}% (supplier_${supplier_id}) [source: ${source}]`);
                }
            } else if (supplierItem) {
                // Solo en proveedor
                warehouse_id = supplierItem.warehouse_id;
                supplier_id = warehouseSupplierMap.get(warehouse_id);
                markup = supplierMarkupMap.get(supplier_id) || defaultMarkup;
                totalStock = supplierItem.quantity || 0;
                source = 'supplier';
            } else if (inventoryItem) {
                // Solo en inventario (Grimax)
                warehouse_id = 1; // Warehouse Grimax
                supplier_id = 1; // Grimax
                markup = defaultMarkup; // Usar markup global para Grimax
                totalStock = inventoryItem.quantity || 0;
                source = 'inventory';
            }

            // Calcular precio final
            const costPrice = supplierItem?.cost_price || inventoryItem?.cost_price || 0;
            const finalPrice = costPrice * (1 + markup / 100);

            // Log para casos sin warehouse_id
            if (!warehouse_id) {
                console.log(`⚠️ SKU ${originalSku}: NO warehouse_id → markup ${markup}% (global) [source: ${source}]`);
            }

            syncCacheData.push({
                sku: originalSku,
                calculated_stock: totalStock,
                calculated_price: finalPrice,
                created_at: new Date().toISOString()
            });

            processedCount++;
            if (processedCount % 5000 === 0) {
                console.log(`📈 Procesados: ${processedCount}/${allSkus.size} SKUs`);
            }
        }

        console.log(`📊 Stock agregado para ${allSkus.size} SKUs únicos`);

        // Insertar en lotes
        console.log('💾 Agregando stock de todas las fuentes...');
        for (let i = 0; i < syncCacheData.length; i += BATCH_SIZE) {
            const batch = syncCacheData.slice(i, i + BATCH_SIZE);
            console.log(`📤 Insertando lote ${Math.floor(i/BATCH_SIZE) + 1}: ${batch.length} registros`);
            
            const { error: insertError } = await supabaseAdmin
                .from('sync_cache')
                .upsert(batch, { onConflict: 'sku' }); // Usar upsert para evitar duplicados
                
            if (insertError) {
                console.error(`❌ Error insertando lote ${Math.floor(i/BATCH_SIZE) + 1}:`, insertError);
                throw insertError;
            }
            
            console.log(`✅ Insertados: ${Math.min(i + BATCH_SIZE, syncCacheData.length)}/${syncCacheData.length}`);
        }

        console.log(`🎉 Insertando ${syncCacheData.length} registros en lotes...`);
        console.log('✅ Procesando ${syncCacheData.length} registros finales...');

        // Obtener stats finales
        const { count } = await supabaseAdmin
            .from('sync_cache')
            .select('*', { count: 'exact', head: true });

        console.log(`📊 Listingss: ${count} registros`);

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: `Pre-sync completado: ${count} registros en sync_cache`,
                processed_skus: allSkus.size,
                total_records: count
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('❌ Error en pre-sync-aggregator:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { 
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
        );
    }
});