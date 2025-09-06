// Ruta: supabase/functions/master-sync-orchestrator/index.ts
// VERSIÓN V33: Llama a la función de la base de datos.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    console.log("Iniciando ORQUESTADOR V33 (Llamada a BBDD)...");
    
    const { data: credentials, error: credError } = await supabaseAdmin.from('meli_credentials').select('user_id');
    if (credError || !credentials) throw credError;

    for (const cred of credentials) {
      console.log(`--- Llamando a la función de BBDD 'prepare_sync_cache' para el usuario: ${cred.user_id} ---`);
      
      const { error: rpcError } = await supabaseAdmin.rpc('prepare_sync_cache', { p_user_id: cred.user_id });

      if (rpcError) {
        console.error(`Error al ejecutar RPC para ${cred.user_id}:`, rpcError);
      } else {
        console.log(`RPC 'prepare_sync_cache' completado para ${cred.user_id}. La cadena de obreros debería iniciar ahora.`);
        // Invocamos manualmente el primer obrero después del éxito del RPC
         supabaseAdmin.functions.invoke('stock-aggregator-and-sync', { body: { userId: cred.user_id, page: 0 } })
        .catch(err => console.error(`Error al disparar el primer obrero para ${cred.user_id}:`, err));
      }
    }
    return new Response(JSON.stringify({ success: true, message: "Orquestación V33 iniciada." }), { headers: corsHeaders });
  } catch (error) {
    console.error("Error fatal en el orquestador V33:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});