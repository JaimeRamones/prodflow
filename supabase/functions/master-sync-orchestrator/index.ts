// Ruta: supabase/functions/master-sync-orchestrator/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (_req) => {
  try {
    const supabaseAdmin = createClient( Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '' );
    console.log("Iniciando orquestador ASÍNCRONO...");

    const { data: credentials, error: credError } = await supabaseAdmin.from('meli_credentials').select('user_id');
    if (credError) throw credError;
    if (!credentials || credentials.length === 0) {
      return new Response(JSON.stringify({ message: "No hay usuarios para sincronizar." }), { headers: corsHeaders });
    }

    for (const cred of credentials) {
      const userId = cred.user_id;
      console.log(`--- Disparando sincronización para el usuario: ${userId} ---`);
      supabaseAdmin.functions.invoke('stock-aggregator-and-sync', { body: { userId: userId } });
      supabaseAdmin.functions.invoke('kit-processor', { body: { userId: userId } });
    }

    return new Response(JSON.stringify({ success: true, message: "Orquestación completada. Tareas ejecutándose en segundo plano." }), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});