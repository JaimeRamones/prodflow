import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' 
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    try {
        console.log('🔄 Iniciando renovación de token ML...');
        
        // Obtener credentials actuales
        const { data: credentials, error: credError } = await supabase
            .from('meli_credentials')
            .select('*')
            .single();

        if (credError || !credentials) {
            throw new Error('No se encontraron credenciales de ML');
        }

        console.log(`Token actual expira: ${credentials.expires_at}`);

        // Renovar token usando refresh_token
        const tokenResponse = await fetch('https://api.mercadolibre.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: Deno.env.get('MELI_CLIENT_ID') ?? '',
                client_secret: Deno.env.get('MELI_CLIENT_SECRET') ?? '',
                refresh_token: credentials.refresh_token
            })
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Error renovando token ML: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenData = await tokenResponse.json();
        console.log(`✅ Token renovado, expira en: ${tokenData.expires_in} segundos`);

        // Calcular nueva fecha de expiración
        const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

        // Actualizar credentials en base de datos
        const { error: updateError } = await supabase
            .from('meli_credentials')
            .update({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token || credentials.refresh_token,
                expires_at: newExpiresAt.toISOString(),
                last_updated: new Date().toISOString()
            })
            .eq('id', credentials.id);

        if (updateError) throw updateError;

        console.log(`✅ Credentials actualizadas. Nuevo vencimiento: ${newExpiresAt.toISOString()}`);

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: 'Token renovado exitosamente',
                old_expires: credentials.expires_at,
                new_expires: newExpiresAt.toISOString(),
                expires_in_hours: Math.round(tokenData.expires_in / 3600)
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('❌ Error renovando token ML:', error);
        return new Response(
            JSON.stringify({ 
                success: false,
                error: error.message 
            }),
            { 
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
        );
    }
});