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
        console.log('🚀 Ejecutando Database Function para sync_cache...');
        
        const startTime = Date.now();
        
        // Llamar a la Database Function
        const { data, error } = await supabaseAdmin.rpc('generate_sync_cache');
        
        if (error) throw error;
        
        const endTime = Date.now();
        const executionTime = (endTime - startTime) / 1000;
        
        const stats = data[0];
        console.log(`✅ Database Function completada en ${executionTime}s`);
        console.log(`📊 Estadísticas:`);
        console.log(`   - SKUs procesados: ${stats.processed_skus}`);
        console.log(`   - Solo inventario: ${stats.inventory_only}`);
        console.log(`   - Solo proveedor: ${stats.supplier_only}`);
        console.log(`   - Ambas fuentes: ${stats.both_sources}`);
        console.log(`   - Total registros: ${stats.total_records}`);

        // Verificar SKUs específicos para debugging
        const { data: specificCheck, error: checkError } = await supabaseAdmin
            .rpc('check_specific_skus', { 
                sku_list: ['ACONTI   CT 1126', 'AJOHNSON 2802A1'] 
            });
            
        if (!checkError && specificCheck) {
            console.log(`🔍 Verificación SKUs específicos:`);
            specificCheck.forEach(item => {
                console.log(`   - ${item.sku}: supplier=${item.in_supplier_items}, inventory=${item.in_products}, markup=${item.final_markup}%, source=${item.source_type}`);
            });
        }

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: 'Sync cache generado exitosamente',
                execution_time_seconds: executionTime,
                statistics: stats,
                specific_skus_check: specificCheck
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('❌ Error ejecutando Database Function:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { 
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
        );
    }
});