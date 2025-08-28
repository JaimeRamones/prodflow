import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

// --- Se restaura la función para obtener el token desde las variables de entorno ---
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
        
        // Obtenemos un token nuevo en cada ejecución
        const dropboxToken = await getDropboxAccessToken();

        console.log("Iniciando el procesamiento de archivos de Dropbox.");

        const { data: warehouses, error: warehouseError } = await supabaseAdmin
            .from('warehouses')
            .select('id, file_name, user_id') // Obtenemos el user_id para asociar los items
            .eq('type', 'proveedor');
        
        if (warehouseError) throw warehouseError;
        if (!warehouses || warehouses.length === 0) {
            return new Response(JSON.stringify({ message: "No se encontraron almacenes de tipo 'proveedor'." }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
            });
        }

        const listFilesResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${dropboxToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ path: '' }),
        });

        if (!listFilesResponse.ok) {
            throw new Error('Error al listar archivos de Dropbox.');
        }

        const filesData = await listFilesResponse.json();
        const stockFileEntries = filesData.entries.filter(file => file['.tag'] === 'file' && (file.name.endsWith('.txt') || file.name.endsWith('.csv')));

        if (stockFileEntries.length === 0) {
            return new Response(JSON.stringify({ message: "No se encontraron archivos para procesar." }), { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 
            });
        }

        for (const file of stockFileEntries) {
            const warehouse = warehouses.find(w => w.file_name === file.name);
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

            const itemsToUpsert = [];

            for (const line of lines) {
                const match = line.match(/^(.+?)\s+(\d+)\s+([\d,.]+)$/);
                if (match) {
                    const sku = match[1].trim();
                    const quantity = parseInt(match[2], 10);
                    const cost = parseFloat(match[3].replace(',', '.'));

                    if (sku && !isNaN(quantity) && !isNaN(cost)) {
                        itemsToUpsert.push({
                            user_id: warehouse.user_id, // Usamos el user_id del almacén
                            warehouse_id: warehouse.id,
                            sku: sku,
                            quantity: quantity,
                            cost: cost,
                            last_updated: new Date().toISOString(),
                        });
                    }
                } else {
                    console.warn(`La línea no coincide con el formato esperado y fue ignorada: "${line}"`);
                }
            }

            if (itemsToUpsert.length > 0) {
                await supabaseAdmin.from('supplier_stock_items').delete().eq('warehouse_id', warehouse.id);
                
                const { error: upsertError } = await supabaseAdmin.from('supplier_stock_items').insert(itemsToUpsert);
                if (upsertError) throw upsertError;

                console.log(`Se procesaron y guardaron ${itemsToUpsert.length} items para el archivo ${file.name}.`);
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