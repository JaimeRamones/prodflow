import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

// Se mantiene tu función para obtener el token desde las variables de entorno
async function getDropboxAccessToken() {
    const refreshToken = Deno.env.get('DROPBOX_REFRESH_TOKEN')
    const appKey = Deno.env.get('DROPBOX_APP_KEY')
    const appSecret = Deno.env.get('DROPBOX_APP_SECRET')

    if (!refreshToken || !appKey || !appSecret) {
        throw new Error('Faltan secretos de Dropbox en la configuración (APP_KEY, APP_SECRET, o REFRESH_TOKEN).');
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

        const listFilesResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${dropboxToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: '' }),
        });

        if (!listFilesResponse.ok) throw new Error('Error al listar archivos de Dropbox.');

        const filesData = await listFilesResponse.json();
        const stockFileEntries = filesData.entries.filter(file => file['.tag'] === 'file' && (file.name.endsWith('.txt') || file.name.endsWith('.csv')));

        if (stockFileEntries.length === 0) {
            return new Response(JSON.stringify({ message: "No se encontraron archivos para procesar." }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 
            });
        }

        for (const file of stockFileEntries) {
            const providerName = file.name.replace(/\.(txt|csv)$/i, '');
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

            const fileContent = await downloadResponse.text();
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');

            const itemsToInsert = [];

            for (const line of lines) {
                // --- LÓGICA DE PARSEO DEFINITIVA (DE DERECHA A IZQUIERDA) ---
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                // 1. Identificar el Precio (desde el final)
                const lastSpaceIndex = trimmedLine.lastIndexOf(' ');
                if (lastSpaceIndex === -1) {
                    console.warn(`Formato inválido (No se encontró Precio): "${line}"`);
                    continue;
                }
                const priceStr = trimmedLine.substring(lastSpaceIndex + 1);
                let remaining = trimmedLine.substring(0, lastSpaceIndex).trimEnd();

                // 2. Identificar la Cantidad
                const penultimateSpaceIndex = remaining.lastIndexOf(' ');
                if (penultimateSpaceIndex === -1) {
                    console.warn(`Formato inválido (No se encontró Cantidad): "${line}"`);
                    continue;
                }
                const quantityStr = remaining.substring(penultimateSpaceIndex + 1);

                // 3. Extraer el SKU (todo lo que queda, con espacios originales)
                const sku = remaining.substring(0, penultimateSpaceIndex).trimEnd();

                if (!sku) {
                    console.warn(`SKU vacío en línea: "${line}"`);
                    continue;
                }

                const quantity = parseInt(quantityStr, 10);
                const cost_price = parseFloat(priceStr.replace(',', '.'));

                if (!isNaN(quantity) && !isNaN(cost_price)) {
                    itemsToInsert.push({
                        warehouse_id: warehouse.id,
                        sku: sku,
                        quantity: quantity,
                        cost_price: cost_price,
                        last_updated: new Date().toISOString(),
                    });
                } else {
                     console.warn(`Error al parsear la línea (cantidad o precio no numéricos): "${line}"`);
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
