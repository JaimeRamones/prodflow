// supabase/functions/dropbox-file-processor/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// --- Nueva Función para obtener un Access Token fresco ---
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
    return data.access_token; // Devuelve el nuevo access_token de corta duración
}


serve(async (_req) => {
  try {
    // Obtenemos un token nuevo en cada ejecución
    const dropboxToken = await getDropboxAccessToken();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { data: warehouses, error: warehouseError } = await supabaseAdmin
      .from('warehouses')
      .select('id, name')
      .eq('type', 'proveedor');
    
    if (warehouseError) throw warehouseError;

    const listFilesResponse = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${dropboxToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: '' }),
    });

    if (!listFilesResponse.ok) {
      const errorBody = await listFilesResponse.text();
      console.error("Error detallado de Dropbox al listar archivos:", errorBody);
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
        const providerName = file.name.replace(/\.(txt|csv)$/i, '');
        const warehouse = warehouses.find(w => w.name.toLowerCase() === providerName.toLowerCase());

        if (!warehouse) {
            console.log(`Archivo '${file.name}' ignorado: no se encontró un proveedor coincidente.`);
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

        const itemsToUpsert = lines.map(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return null;
            const lastSpaceIndex = trimmedLine.lastIndexOf(' ');
            if (lastSpaceIndex === -1) return null;
            const costPriceStr = trimmedLine.substring(lastSpaceIndex + 1);
            let remainingLine = trimmedLine.substring(0, lastSpaceIndex).trim();
            const secondLastSpaceIndex = remainingLine.lastIndexOf(' ');
            if (secondLastSpaceIndex === -1) return null;
            const quantityStr = remainingLine.substring(secondLastSpaceIndex + 1);
            const sku = remainingLine.substring(0, secondLastSpaceIndex).trim();
            const quantity = parseInt(quantityStr, 10);
            const cost_price = parseFloat(costPriceStr);
            if (sku && !isNaN(quantity) && !isNaN(cost_price)) {
                return {
                    warehouse_id: warehouse.id,
                    sku: sku,
                    quantity: quantity,
                    cost_price: cost_price,
                    last_updated: new Date().toISOString(),
                };
            }
            return null;
        }).filter(item => item !== null);

        if (itemsToUpsert.length > 0) {
            const { error: upsertError } = await supabaseAdmin
                .from('supplier_stock_items')
                .upsert(itemsToUpsert, { onConflict: 'warehouse_id, sku' });
            if (upsertError) {
                console.error(`Error al hacer upsert de stock para ${providerName}:`, upsertError.message);
            } else {
                console.log(`Stock y costos para ${providerName} actualizados con ${itemsToUpsert.length} artículos.`);
            }
        }
    }

    return new Response(JSON.stringify({ success: true, message: `Proceso completado.` }), {
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