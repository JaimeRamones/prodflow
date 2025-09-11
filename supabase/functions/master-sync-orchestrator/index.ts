// Ruta: supabase/functions/master-sync-orchestrator/index.ts
// VERSIÓN BYPASS-RPC - Evita el RPC problemático
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

serve(async (_req) => {
    try {
        console.log("🚀 Iniciando ORQUESTADOR BYPASS-RPC (Evitando RPC problemático)...");
        
        const { data: credentials, error: credError } = await supabaseAdmin
            .from('meli_credentials')
            .select('user_id');
            
        if (credError || !credentials) {
            console.error("❌ Error obteniendo credenciales:", credError);
            throw credError;
        }

        console.log(`📋 Usuarios a procesar: ${credentials.length}`);

        for (const cred of credentials) {
            const userId = cred.user_id;
            console.log(`\n--- 👤 Procesando usuario: ${userId} ---`);
            
            try {
                // USAR EDGE FUNCTION EN LUGAR DE RPC PROBLEMÁTICO
                console.log(`🔄 Ejecutando pre-sync-aggregator para recalcular precios/stock...`);
                
                try {
                    const preResult = await supabaseAdmin.functions.invoke('pre-sync-aggregator', { 
                        body: { userId: userId } 
                    });
                    
                    if (preResult.error) {
                        console.error(`❌ Error en pre-sync-aggregator para ${userId}:`, preResult.error);
                        continue; // Saltar este usuario si falla
                    }
                    
                    console.log(`✅ Cache recalculado para ${userId}`);
                    
                    // Pequeña pausa para asegurar que el cache se actualice
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                } catch (preError) {
                    console.error(`💥 Error ejecutando pre-sync-aggregator para ${userId}:`, preError);
                    continue; // Saltar este usuario si falla
                }
                
                // Iniciar la cadena de sincronización con cache actualizado
                console.log(`🚀 Iniciando sincronización con cache actualizado para ${userId}...`);
                
                supabaseAdmin.functions.invoke('stock-aggregator-and-sync', { 
                    body: { 
                        userId: userId, 
                        page: 0
                    } 
                }).then((result) => {
                    if (result.error) {
                        console.error(`❌ Error invocando stock-aggregator para ${userId}:`, result.error);
                    } else {
                        console.log(`✅ Sincronización iniciada para ${userId}`);
                    }
                }).catch((error) => {
                    console.error(`💥 Error async invocando stock-aggregator para ${userId}:`, error);
                });
                
            } catch (error) {
                console.error(`💥 Error procesando ${userId}:`, error);
            }
        }
        
        console.log("\n🎯 Orquestación BYPASS-RPC completada.");
        
        return new Response(
            JSON.stringify({ 
                success: true, 
                message: "Orquestación BYPASS-RPC completada (sin prepare_sync_cache)",
                usersProcessed: credentials.length,
                note: "Se saltó el RPC prepare_sync_cache debido a error SQL"
            }), 
            { headers: corsHeaders }
        );
        
    } catch (error) {
        console.error("💥 Error fatal en el orquestador BYPASS-RPC:", error);
        return new Response(
            JSON.stringify({ error: error.message }), 
            { status: 500, headers: corsHeaders }
        );
    }
});

/*
NOTA IMPORTANTE:
Esta versión evita el RPC problemático y usa directamente el cache existente.
Si el cache está desactualizado, los precios/stock no se actualizarán correctamente.

PARA ARREGLAR EL RPC PERMANENTLY:
1. Revisar el SQL del RPC prepare_sync_cache 
2. Buscar errores de sintaxis alrededor de la posición 7422
3. Verificar nombres de tablas/columnas
4. Probar el SQL directamente en el editor SQL de Supabase
*/