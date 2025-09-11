// Ruta: supabase/functions/status-activator/index.ts
// VERSIÓN V41.1: Obrero Paciente y Resiliente - COMPLETO
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const BATCH_SIZE = 50;

async function getRefreshedToken(refreshToken: string, userId: string, supabaseClient: any): Promise<string> {
    const clientId = Deno.env.get('MELI_APP_ID');
    const clientSecret = Deno.env.get('MELI_SECRET_KEY');
    if (!clientId || !clientSecret) throw new Error('Falta configuración del servidor.');
    const response = await fetch('https://api.mercadolibre.com/oauth/token', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, 
        body: new URLSearchParams({ 
            grant_type: 'refresh_token', 
            client_id: clientId, 
            client_secret: clientSecret, 
            refresh_token: refreshToken 
        })
    });
    if (!response.ok) throw new Error(`Error de API Meli (Status ${response.status}).`);
    const data = await response.json();
    const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
    await supabaseClient.from('meli_credentials').update({ 
        access_token: data.access_token, 
        refresh_token: data.refresh_token, 
        expires_at: expires_at 
    }).eq('user_id', userId);
    return data.access_token;
}

async function updateMeliItem(meliId: string, payload: any, accessToken: string, retries = 3, initialDelayMs = 2000): Promise<{ success: boolean }> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(`https://api.mercadolibre.com/items/${meliId}`, { 
                method: 'PUT', 
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });
            if (response.ok) return { success: true };
            
            const status = response.status;
            const errorBody = await response.json().catch(() => null);

            if (status === 400) {
                console.error(`ERROR DE VALIDACIÓN en ${meliId}. Causa: ${JSON.stringify(errorBody, null, 2)}`);
                return { success: false };
            }

            if ((status === 429 || status === 403) && i < retries - 1) {
                const waitTime = initialDelayMs * Math.pow(2, i);
                console.warn(`WARN: Conflicto (${status}) al actualizar status de ${meliId}. Reintentando en ${waitTime / 1000}s...`);
                await delay(waitTime);
                continue;
            }
            
            console.error(`ERROR FINAL en ${meliId}. Status: ${status}. Causa: ${JSON.stringify(errorBody, null, 2)}`);
            return { success: false };

        } catch (networkError) {
            if (i < retries - 1) {
                await delay(initialDelayMs * Math.pow(2, i));
                continue;
            }
            console.error(`ERROR DE RED FINAL en ${meliId}:`, networkError.message);
            return { success: false };
        }
    }
    return { success: false };
}

serve(async (req) => {
    let page = 0;
    let userId = null;
    try {
        const body = await req.json();
        userId = body.userId;
        page = body.page || 0;
        if (!userId) throw new Error("userId es requerido.");
        
        console.log(`Iniciando ACTIVADOR DE ESTADO (V41.1) para Usuario ${userId}, Lote ${page + 1}...`);
        
        // Obtener y verificar token
        const { data: tokenData } = await supabaseAdmin
            .from('meli_credentials')
            .select('access_token, refresh_token, expires_at')
            .eq('user_id', userId)
            .single();
            
        if (!tokenData) throw new Error("No hay credenciales");
        
        let accessToken = tokenData.access_token;
        if (new Date(tokenData.expires_at) < new Date(Date.now() + 5 * 60000)) {
            accessToken = await getRefreshedToken(tokenData.refresh_token, userId, supabaseAdmin);
        }
        
        // Obtener lote de listings para verificar estado
        const { data: listingsBatch, error } = await supabaseAdmin
            .from('mercadolibre_listings')
            .select('id, meli_id, prodflow_stock, status')
            .eq('user_id', userId)
            .eq('sync_enabled', true)
            .in('status', ['active', 'paused'])
            .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

        if (error) throw error;

        console.log(`Lote obtenido: ${listingsBatch?.length || 0} listings para verificar estado`);

        // Verificar si es el último lote
        if (!listingsBatch || listingsBatch.length === 0 || listingsBatch.length < BATCH_SIZE) {
            const totalProcessed = page * BATCH_SIZE + (listingsBatch?.length || 0);
            console.log(`🏁 ¡LÍNEA DE ENSAMBLAJE COMPLETADA! Sincronización finalizada. Total procesado: ~${totalProcessed}`);
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    message: `Sincronización completada exitosamente. Total: ~${totalProcessed}` 
                }), 
                { headers: corsHeaders }
            );
        }

        // Procesar cambios de estado
        const updatePromises = [];
        for (const listing of (listingsBatch || [])) {
            const promise = (async () => {
                const shouldBeActive = listing.prodflow_stock > 0;
                const currentlyActive = listing.status === 'active';
                
                // Solo actualizar si hay cambio necesario
                if (shouldBeActive === currentlyActive) return null;
                
                const newStatus = shouldBeActive ? 'active' : 'paused';
                const payload = { status: newStatus };
                
                const result = await updateMeliItem(listing.meli_id, payload, accessToken);
                
                if (result.success) {
                    return {
                        id: listing.id,
                        status: newStatus,
                        last_synced_at: new Date().toISOString()
                    };
                }
                return null;
            })();
            updatePromises.push(promise);
        }

        const results = await Promise.all(updatePromises);
        const successfulUpdates = results.filter(r => r !== null);
        
        console.log(`Cambios de estado: ${successfulUpdates.length}/${listingsBatch?.length || 0} actualizados`);

        // Actualizar base de datos
        if (successfulUpdates.length > 0) {
            console.log(`-> Actualizando localmente ${successfulUpdates.length} registros de estado en Supabase...`);
            for (const updateData of successfulUpdates) {
                const { id, ...dataToUpdate } = updateData as any;
                await supabaseAdmin.from('mercadolibre_listings').update(dataToUpdate).eq('id', id);
            }
        }

        // Programar siguiente lote
        console.log(`Lote ${page + 1} de status-activator completado. Pasando relevo al siguiente lote.`);
        await delay(1000);
        
        try {
            await supabaseAdmin.functions.invoke('status-activator', { 
                body: { userId, page: page + 1 } 
            });
            console.log("✅ Siguiente lote de status-activator programado exitosamente");
        } catch (error) {
            console.error("❌ Error programando siguiente lote de status-activator:", error);
        }

        return new Response(
            JSON.stringify({ 
                success: true, 
                message: `Lote ${page + 1} de status-activator completado.` 
            }), 
            { headers: corsHeaders }
        );
        
    } catch (error) {
        console.error(`Error fatal en ACTIVADOR DE ESTADO V41.1 (Lote ${page}): ${error.message}`);
        return new Response(
            JSON.stringify({ error: error.message }), 
            { status: 500, headers: corsHeaders }
        );
    }
});