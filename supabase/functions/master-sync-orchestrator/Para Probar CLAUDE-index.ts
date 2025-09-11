// Ruta: supabase/functions/master-sync-orchestrator/index.ts
// VERSIÓN V42 - COMPLETA Y ESTABLE
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    console.log("Iniciando ORQUESTADOR V42 (Línea de Ensamblaje Estable)...");
    
    const { data: credentials, error: credError } = await supabaseAdmin.from('meli_credentials').select('user_id');
    if (credError || !credentials) throw credError;

    for (const cred of credentials) {
      const userId = cred.user_id;
      console.log(`--- Llamando a la función de BBDD 'prepare_sync_cache' para el usuario: ${userId} ---`);
      
      // ¡ESTA ES LA LLAMADA CLAVE Y CORRECTA!
      const { error: rpcError } = await supabaseAdmin.rpc('prepare_sync_cache', { p_user_id: userId });

      if (rpcError) {
        console.error(`Error al ejecutar RPC 'prepare_sync_cache' para ${userId}:`, rpcError);
      } else {
        console.log(`RPC 'prepare_sync_cache' completado para ${userId}. Iniciando cadena de obreros...`);
        // Después del éxito del RPC, iniciamos la cadena de Edge Functions
        supabaseAdmin.functions.invoke('stock-aggregator-and-sync', { body: { userId: userId, page: 0 } })
          .catch(err => console.error(`Error al disparar el primer obrero para ${userId}:`, err));
      }
    }
    return new Response(JSON.stringify({ success: true, message: "Orquestación V42 iniciada." }), { headers: corsHeaders });
  } catch (error) {
    console.error("Error fatal en el orquestador V42:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});