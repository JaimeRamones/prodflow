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

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log('🚀 Ejecutando Database Function generate_sync_cache...');
        const startTime = Date.now();
        
        // Llamar a la Database Function generate_sync_cache
        const { error } = await supabaseAdmin.rpc('generate_sync_cache');
        
        if (error) throw error;
        
        const endTime = Date.now();
        const executionTime = (endTime - startTime) / 1000;
        
        // Obtener estadísticas totales (sin filtrar por user_id)
        const { count } = await supabaseAdmin
            .from('sync_cache')
            .select('*', { count: 'exact', head: true });

        console.log(`✅ Database Function completada en ${executionTime}s`);
        console.log(`📊 Total registros: ${count}`);

        return new Response(JSON.stringify({ 
            success: true, 
            total_records: count,
            execution_time_seconds: executionTime
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('❌ Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
    }
});