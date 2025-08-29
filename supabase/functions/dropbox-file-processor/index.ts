// Ruta: supabase/functions/dropbox-file-processor/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'
import * as xlsx from 'https://esm.sh/xlsx@0.18.5'

async function getDropboxAccessToken() {
    const refreshToken = Deno.env.get('DROPBOX_REFRESH_TOKEN')
    const appKey = Deno.env.get('DROPBOX_APP_KEY')
    const appSecret = Deno.env.get('DROPBOX_APP_SECRET')

    if (!refreshToken || !appKey || !appSecret) {
        throw new Error('Faltan secretos de Dropbox en la configuración.');
    }

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
        console.error("Error al refrescar el token de Dropbox:", errorBody);
        throw new Error(`No se pudo obtener un nuevo access token de Dropbox: ${errorBody.error_description}`);
    }

    const data = await response.json();
    return data.access_token;
}

serve(async (_req) => {
    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        
        const dropboxToken = await getDropboxAccessToken();

        console.log("Iniciando el procesamiento de archivos de Dropbox.");

        const { data: warehouses, error: warehouseError } = await supabaseAdmin
            .from('warehouses')
            .select('id, name') 
            .eq('type', 'proveedor');
        
        if (warehouseError) throw warehouseError;

        if (!warehouses || warehouses.length === 0) {
            return new Response(JSON.stringify({ message: "No se encontraron almacenes de tipo 'proveedor'." }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
            });
        }

        const supplierHeaderConfig = {
            'rodamitre': { sku: 'cod. art.', price: 'neto + iva', stock: 'stock 1' },
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

        if (stockFileEntries.length === 0) {
            return new Response(JSON.stringify({ message: "No se encontraron archivos para procesar." }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 
            });
        }

        for (const file of stockFileEntries) {
            const providerName = file.name.replace(/\.(txt|csv|xlsx)$/i, '');
            const warehouse = warehouses.find(w => w.name.toLowerCase() === providerName.toLowerCase());

            if (!warehouse) {
                console.log(`Archivo '${file.name}' ignorado: no se encontró un almacén coincidente.`);
                continue;
            }

            const downloadResponse = await fetch('https://content.dropboxapi.com/2/files/download', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${dropboxToken}`,
                    'Dropbox-API-Arg': JSON.stringify({ path: file.path_lower }),
                },
            });

            if (!downloadResponse.ok) {
                console.error(`Error al descargar el archivo: ${file.name}`);
                continue;
            }

            const itemsToInsert = [];
            const fileNameLower = file.name.toLowerCase();

            if (fileNameLower.endsWith('.xlsx')) {
                const providerConfig = supplierHeaderConfig[providerName.toLowerCase()];
                if (!providerConfig) {
                    console.log(`Archivo Excel '${file.name}' ignorado: no hay configuración de cabeceras para este proveedor.`);
                    continue;
                }

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
                    console.error(`Archivo '${file.name}' ignorado. No se encontraron todas las cabeceras requeridas para ${providerName}.`);
                    continue;
                }

                for (const row of dataRows) {
                    const sku = row[headerMap.sku]?.toString().trim();
                    const quantity = parseInt(row[headerMap.stock], 10);
                    const raw_price = parseFloat(row[headerMap.price]);

                    // --- CORRECCIÓN: Redondeamos el precio a 2 decimales ---
                    const cost_price = parseFloat(raw_price.toFixed(2));

                    if (sku && !isNaN(quantity) && !isNaN(cost_price)) {
                        itemsToInsert.push({
                            warehouse_id: warehouse.id,
                            sku, quantity, cost_price,
                            last_updated: new Date().toISOString(),
                        });
                    }
                }

            } else { // Lógica para .txt y .csv (Rodamet)
                const fileContent = await downloadResponse.text();
                const lines = fileContent.split(/\r?\n/);
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    const parts = line.split('\t');
                    if (parts.length < 3) {
                        console.warn(`Formato inválido (No hay 3 campos separados por tabulador): "${line}"`);
                        continue;
                    }
                    const priceStr = parts[parts.length - 1];
                    const quantityStr = parts[parts.length - 2];
                    const sku = parts.slice(0, parts.length - 2).join(' ');
                    if (!sku) continue;
                    const quantity = parseInt(quantityStr, 10);
                    const raw_price = parseFloat(priceStr.replace(',', '.'));

                    // --- CORRECCIÓN: Redondeamos el precio a 2 decimales ---
                    const cost_price = parseFloat(raw_price.toFixed(2));

                    if (!isNaN(quantity) && !isNaN(cost_price)) {
                        itemsToInsert.push({
                            warehouse_id: warehouse.id,
                            sku, quantity, cost_price,
                            last_updated: new Date().toISOString(),
                        });
                    }
                }
            }

            if (itemsToInsert.length > 0) {
                await supabaseAdmin.from('supplier_stock_items').delete().eq('warehouse_id', warehouse.id);
                const { error: insertError } = await supabaseAdmin.from('supplier_stock_items').insert(itemsToInsert);
                if (insertError) throw insertError;
                console.log(`Se procesaron y guardaron ${itemsToInsert.length} items para el archivo ${file.name}.`);
            }
        }

        return new Response(JSON.stringify({ success: true, message: "Archivos de Dropbox procesados." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error en la función dropbox-file-processor:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});