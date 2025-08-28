import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'
import { Dropbox } from 'https://esm.sh/dropbox@10.34.0'

// Función para refrescar el token de Dropbox
async function getRefreshedDropboxToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) {
    const DROPBOX_APP_KEY = Deno.env.get('DROPBOX_APP_KEY')!
    const DROPBOX_APP_SECRET = Deno.env.get('DROPBOX_APP_SECRET')!
    
    const response = await fetch('https://api.dropbox.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: DROPBOX_APP_KEY,
            client_secret: DROPBOX_APP_SECRET,
        }),
    });

    if (!response.ok) throw new Error('Failed to refresh Dropbox token');
    
    const newTokens = await response.json();
    await supabaseAdmin.from('dropbox_credentials').update({
        access_token: newTokens.access_token,
        // Dropbox a veces no devuelve un nuevo refresh token, usamos el viejo si no viene
        refresh_token: newTokens.refresh_token || refreshToken,
        expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
    }).eq('user_id', userId);

    return newTokens.access_token;
}

serve(async (_req) => {
    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        console.log("Iniciando el procesamiento de archivos de Dropbox.");

        const { data: allUserCredentials, error: credsError } = await supabaseAdmin
            .from('dropbox_credentials')
            .select('*');

        if (credsError) throw credsError;
        if (!allUserCredentials || allUserCredentials.length === 0) {
            return new Response(JSON.stringify({ message: "No users with Dropbox credentials found." }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
            });
        }

        for (const tokenData of allUserCredentials) {
            const userId = tokenData.user_id;
            let accessToken = tokenData.access_token;

            if (new Date(tokenData.expires_at) < new Date()) {
                accessToken = await getRefreshedDropboxToken(tokenData.refresh_token, supabaseAdmin, userId);
            }

            const dbx = new Dropbox({ accessToken });
            const { result: { entries } } = await dbx.filesListFolder({ path: '' });

            const { data: warehouses } = await supabaseAdmin.from('warehouses').select('id, file_name').eq('user_id', userId);
            if (!warehouses) continue;

            for (const file of entries) {
                const warehouse = warehouses.find(w => w.file_name === file.name);
                if (!warehouse || !file.path_lower) continue;

                console.log(`Procesando archivo: ${file.name} para el almacén ID: ${warehouse.id}`);
                
                const { result: fileData } = await dbx.filesDownload({ path: file.path_lower });
                const content = await (fileData as any).fileBlob.text();
                const lines = content.split('\n').filter(line => line.trim() !== '');

                const itemsToUpsert = [];

                for (const line of lines) {
                    // --- LÓGICA DE PARSEO MEJORADA Y PRECISA ---
                    // Esta expresión regular captura el SKU (con espacios), el stock y el precio.
                    const match = line.match(/^(.+?)\s+(\d+)\s+([\d,.]+)$/);

                    if (match) {
                        const sku = match[1].trim(); // El SKU capturado, sin espacios extra al inicio/final
                        const quantity = parseInt(match[2], 10);
                        const cost = parseFloat(match[3].replace(',', '.')); // Reemplaza comas por puntos para el decimal

                        if (sku && !isNaN(quantity) && !isNaN(cost)) {
                            itemsToUpsert.push({
                                user_id: userId,
                                warehouse_id: warehouse.id,
                                sku: sku, // Se guarda el SKU con sus espacios internos
                                quantity: quantity,
                                cost: cost, // Asegúrate que tu tabla se llame 'cost' y no 'cost_price'
                                last_updated: new Date().toISOString(),
                            });
                        }
                    } else {
                        console.warn(`La línea no coincide con el formato esperado y fue ignorada: "${line}"`);
                    }
                }

                if (itemsToUpsert.length > 0) {
                    // Borramos los datos viejos de este almacén antes de insertar los nuevos
                    await supabaseAdmin.from('supplier_stock_items').delete().eq('warehouse_id', warehouse.id);
                    
                    // Insertamos todos los nuevos items en una sola operación
                    const { error: upsertError } = await supabaseAdmin.from('supplier_stock_items').insert(itemsToUpsert);
                    if (upsertError) throw upsertError;

                    console.log(`Se procesaron y guardaron ${itemsToUpsert.length} items para el archivo ${file.name}.`);
                }
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
