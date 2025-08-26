// supabase/functions/dropbox-file-processor/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (_req) => {
  try {
    const dropboxToken = Deno.env.get('DROPBOX_ACCESS_TOKEN');
    if (!dropboxToken) {
      throw new Error('El secreto DROPBOX_ACCESS_TOKEN no está configurado.');
    }

    const { data: warehouses, error: warehouseError } = await supabaseAdmin
      .from('warehouses')
      .select('id, name')
      .eq('type', 'proveedor');
    
    if (warehouseError) throw warehouseError;
    if (!warehouses || warehouses.length === 0) {
      return new Response(JSON.stringify({ message: "No hay proveedores configurados en la tabla 'warehouses'." }), { status: 200 });
    }

    console.log(`Procesando archivos para ${warehouses.length} proveedores...`);

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
    const stockFileEntries = filesData.entries.filter(file => file.name.endsWith('.txt') || file.name.endsWith('.csv'));

    if (stockFileEntries.length === 0) {
      return new Response(JSON.stringify({ message: "No se encontraron archivos .txt o .csv para procesar." }), { status: 200 });
    }

    for (const file of stockFileEntries) {
      const providerName = file.name.replace(/\.(txt|csv)$/i, '');
      const warehouse = warehouses.find(w => w.name.toLowerCase() === providerName.toLowerCase());

      if (!warehouse) {
        console.log(`Archivo '${file.name}' ignorado: no se encontró un proveedor coincidente.`);
        continue;
      }

      console.log(`Procesando archivo para el proveedor: ${providerName}`);

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
      
      // --- ¡AQUÍ ESTÁ LA NUEVA LÓGICA INTELIGENTE! ---
      const itemsToUpsert = lines.map(line => {
        // 1. Dividimos la línea por uno o más espacios/tabulaciones
        const parts = line.trim().split(/\s+/);
        
        if (parts.length < 2) return null; // Ignoramos líneas mal formadas

        // 2. La última parte es siempre la cantidad
        const quantityStr = parts.pop(); 
        const quantity = parseInt(quantityStr, 10);
        
        // 3. Todo lo demás, unido por un espacio, es el SKU
        const sku = parts.join(' ');

        if (sku && !isNaN(quantity)) {
          return {
            warehouse_id: warehouse.id,
            sku: sku,
            quantity: quantity,
            last_updated: new Date().toISOString(),
          };
        }
        return null;
      }).filter(item => item !== null);

      if (itemsToUpsert.length > 0) {
        await supabaseAdmin.from('supplier_stock_items').delete().eq('warehouse_id', warehouse.id);
        const { error: upsertError } = await supabaseAdmin
            .from('supplier_stock_items')
            .insert(itemsToUpsert);
        
        if (upsertError) {
            console.error(`Error al actualizar stock para ${providerName}:`, upsertError.message);
        } else {
            console.log(`Stock para ${providerName} actualizado con ${itemsToUpsert.length} artículos.`);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Proceso completado. Se revisaron ${stockFileEntries.length} archivos.` }), {
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