// Ruta: supabase/functions/master-sync-orchestrator/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log("Iniciando el orquestador de sincronización...");

    // 1. Obtener todos los usuarios que tienen credenciales de ML
    const { data: credentials, error: credError } = await supabaseAdmin
      .from('meli_credentials')
      .select('user_id');

    if (credError) throw credError;
    if (!credentials || credentials.length === 0) {
      return new Response(JSON.stringify({ message: "No hay usuarios para sincronizar." }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    console.log(`Se encontraron ${credentials.length} cuentas de usuario para sincronizar.`);

    // 2. Por cada usuario, invocar las funciones de sincronización en orden
    for (const cred of credentials) {
      const userId = cred.user_id;
      console.log(`--- Iniciando sincronización para el usuario: ${userId} ---`);

      try {
        // Llama a la sincronización base
        console.log(`Invocando 'stock-aggregator-and-sync' para el usuario ${userId}...`);
        await supabaseAdmin.functions.invoke('stock-aggregator-and-sync', {
          body: { userId: userId }
        });

        // Llama a la sincronización de kits
        console.log(`Invocando 'kit-processor' para el usuario ${userId}...`);
        await supabaseAdmin.functions.invoke('kit-processor', {
          body: { userId: userId }
        });
        
        console.log(`--- Sincronización completada para el usuario: ${userId} ---`);

      } catch (userSyncError) {
        console.error(`Fallo la sincronización para el usuario ${userId}:`, userSyncError.message);
        // Continuamos con el siguiente usuario aunque uno falle
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Orquestación completada." }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fatal en el orquestador:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});