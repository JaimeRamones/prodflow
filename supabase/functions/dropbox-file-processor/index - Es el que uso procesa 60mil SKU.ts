// Ruta: supabase/functions/dropbox-file-processor/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'
import * as xlsx from 'https://esm.sh/xlsx@0.18.5'

async function getDropboxAccessToken() {
    // ... (El código de esta función no cambia)
    const refreshToken = Deno.env.get('DROPBOX_REFRESH_TOKEN')!
    const appKey = Deno.env.get('DROPBOX_APP_KEY')!
    const appSecret = Deno.env.get('DROPBOX_APP_SECRET')!

    const response = await fetch('https://api.dropbox.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: appKey,
            client_secret: appSecret,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(`No se pudo obtener un nuevo access token de Dropbox: ${errorBody.error_description}`);
    }

    const data = await response.json();
    return data.access_token;
}

serve(async (_req) => {
    try {
        const supabaseAdmin = createClient( Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! );
        const dropboxToken = await getDropboxAccessToken();
        console.log("Iniciando el procesamiento de archivos de Dropbox.");

        const { data: warehouses } = await supabaseAdmin.from('warehouses').select('id, name').eq('type', 'proveedor');
        if (!warehouses || warehouses.length === 0) {
            return new Response(JSON.stringify({ message: "No se encontraron almacenes." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
        }

        const supplierHeaderConfig = {
            'rodamitre': { sku: 'cod. art. p.', price: 'neto + iva', stock: 'stock 1' },
            'ventor': { sku: 'código', price: 'precio', stock: 'stock' },
            'iden': { sku: 'código', price: 'precio', stock: 'stock' },
            'iturria': { sku: 'código', price: 'precio', stock: 'stock' },
            'rodamientos_brothers': { sku: 'código', price: 'precio', stock: 'stock' }
        };

        const listFilesResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${dropboxToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '' }),
        });
        if (!listFilesResponse.ok) throw new Error('Error al listar archivos de Dropbox.');

        const filesData = await listFilesResponse.json();
        const stockFileEntries = filesData.entries.filter(file => file['.tag'] === 'file' && (file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.xlsx')));
        
        const BATCH_SIZE = 1000;

        for (const file of stockFileEntries) {
            const providerName = file.name.replace(/\.(txt|csv|xlsx)$/i, '');
            const warehouse = warehouses.find(w => w.name.toLowerCase() === providerName.toLowerCase());
            if (!warehouse) continue;

            await supabaseAdmin.from('supplier_stock_items').delete().eq('warehouse_id', warehouse.id);
            console.log(`Stock antiguo de ${providerName} eliminado. Procesando archivo ${file.name}...`);

            const downloadResponse = await fetch('https://content.dropboxapi.com/2/files/download', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${dropboxToken}`, 'Dropbox-API-Arg': JSON.stringify({ path: file.path_lower })},
            });
            if (!downloadResponse.ok) continue;
            
            let totalProcessed = 0;
            const processBatch = async (batchToProcess) => {
                if (batchToProcess.length === 0) return;
                const { error: insertError } = await supabaseAdmin.from('supplier_stock_items').insert(batchToProcess);
                if (insertError) throw insertError;
                totalProcessed += batchToProcess.length;
                console.log(`Lote de ${batchToProcess.length} items guardado para ${providerName}. Total: ${totalProcessed}`);
            };

            const allItems = [];
            const fileNameLower = file.name.toLowerCase();

            if (fileNameLower.endsWith('.xlsx')) {
                // ... (código para leer el excel y mapear cabeceras)
                // ... este código es igual hasta el bucle
                const providerConfig = supplierHeaderConfig[providerName.toLowerCase()];
                if (!providerConfig) continue;

                const fileBuffer = await downloadResponse.arrayBuffer();
                const workbook = xlsx.read(new Uint8Array(fileBuffer), { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                if (jsonData.length < 2) continue;

                const headers = (jsonData[0] as string[]).map(h => h.toLowerCase().trim());
                const dataRows = jsonData.slice(1);
                const headerMap = {
                    sku: headers.findIndex(h => h.includes(providerConfig.sku)),
                    price: headers.findIndex(h => h.includes(providerConfig.price)),
                    stock: headers.findIndex(h => h.includes(providerConfig.stock))
                };
                
                if (Object.values(headerMap).some(index => index === -1)) {
                    console.error(`Archivo '${file.name}' ignorado. Faltan cabeceras.`);
                    continue;
                }

                for (const row of dataRows) {
                    const sku = row[headerMap.sku]?.toString().trim();
                    const quantity = parseInt(row[headerMap.stock], 10);
                    const raw_price = parseFloat(row[headerMap.price]);
                    
                    if (sku && !isNaN(quantity) && !isNaN(raw_price)) {
                        const cost_price = parseFloat(raw_price.toFixed(2));
                        allItems.push({ sku, quantity, cost_price });
                    }
                }
            } else {
                 // ... (código para leer el .txt y parsear líneas)
                 // ... este código es igual hasta el bucle
                const fileContent = await downloadResponse.text();
                const lines = fileContent.split(/\r?\n/);
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    let sku: string | null = null, quantity: number | null = null, cost_price: number | null = null;
                    let parts = line.split('\t');
                    if (parts.length >= 3) {
                         const priceStr = parts[parts.length - 1]; const quantityStr = parts[parts.length - 2]; sku = parts.slice(0, parts.length - 2).join(' '); quantity = parseInt(quantityStr, 10); cost_price = parseFloat(priceStr.replace(',', '.'));
                    } else {
                        const match = line.match(/^(.+?)\s+(\S+)\s+(\S+)$/);
                        if (match) { sku = match[1].trim(); quantity = parseInt(match[2], 10); cost_price = parseFloat(match[3].replace(',', '.'));
                        } else { continue; }
                    }

                    if (sku && quantity !== null && !isNaN(quantity) && cost_price !== null && !isNaN(cost_price)) {
                        allItems.push({ sku, quantity, cost_price: parseFloat(cost_price.toFixed(2)) });
                    }
                }
            }

            // --- NUEVO: Limpieza de Duplicados ---
            const uniqueItems = new Map();
            for (const item of allItems) {
                uniqueItems.set(item.sku, item); // Al usar un Map, cada SKU se sobreescribe, quedándonos con el último
            }
            console.log(`Archivo ${file.name} leído. Total de items: ${allItems.length}. Items únicos: ${uniqueItems.size}.`);

            const itemsToInsertInBatches = Array.from(uniqueItems.values());
            for (let i = 0; i < itemsToInsertInBatches.length; i += BATCH_SIZE) {
                const batch = itemsToInsertInBatches.slice(i, i + BATCH_SIZE).map(item => ({
                    warehouse_id: warehouse.id,
                    sku: item.sku,
                    quantity: item.quantity,
                    cost_price: item.cost_price,
                    last_updated: new Date().toISOString()
                }));
                await processBatch(batch);
            }
        }

        return new Response(JSON.stringify({ success: true, message: "Archivos de Dropbox procesados." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    } catch (error) {
        console.error('Error en la función dropbox-file-processor:', error.message);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }
});