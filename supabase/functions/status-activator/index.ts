// Ruta: supabase/functions/status-activator/index.ts
// VERSIÓN V41: Obrero Paciente y Resiliente
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ... (COPIAR Y PEGAR LAS FUNCIONES AUXILIARES 'getRefreshedToken' y 'updateMeliItem' de la V41) ...

serve(async (req) => {
    let page = 0;
    let userId = null;
    try {
        // ... (lógica de inicio idéntica a las otras funciones V41) ...
        console.log(`Iniciando ACTIVADOR DE ESTADO (V41) para Usuario ${userId}, Lote ${page + 1}...`);
        // ... (lógica de obtener token idéntica) ...
        
        const { data: listingsBatch, error } = await supabaseAdmin
            .from('mercadolibre_listings')
            .select('id, meli_id, prodflow_stock, status')
            .eq('user_id', userId).eq('sync_enabled', true).in('status', ['active', 'paused'])
            .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

        // ... (lógica de procesamiento y actualización de status idéntica a la V32.2) ...

        // LÓGICA DE RELEVOS FINAL
        if (listingsBatch && listingsBatch.length === BATCH_SIZE) {
            console.log(`Lote ${page + 1} de status-activator completado. Pasando relevo al siguiente lote.`);
            await delay(1000);
            supabaseAdmin.functions.invoke('status-activator', { body: { userId, page: page + 1 } }).catch();
        } else {
            console.log(`🏁 ¡Línea de Ensamblaje completada! Sincronización finalizada.`);
        }

        return new Response(JSON.stringify({ success: true, message: `Lote ${page + 1} de status-activator completado.` }), { headers: corsHeaders });
    } catch (error) {
        console.error(`Error fatal en ACTIVADOR DE ESTADO V41 (Lote ${page}): ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
});