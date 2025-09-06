// Ruta: supabase/functions/status-activator/index.ts
// VERSIÓN V32.2: Obrero final de la cadena, completo y revisado.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const BATCH_SIZE = 50;

// --- INICIO DE FUNCIONES AUXILIARES COMPLETAS Y CORRECTAS ---
async function getRefreshedToken(refreshToken: string, userId: string, supabaseClient: any): Promise<string> {
    const clientId = Deno.env.get('MELI_APP_ID');
    const clientSecret = Deno.env.get('MELI_SECRET_KEY');
    if (!clientId || !clientSecret) throw new Error('Falta configuración del servidor.');
    const response = await fetch('https://api.mercadolibre.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }), });
    if (!response.ok) throw new Error(`Error de API Meli (Status ${response.status}).`);
    const data = await response.json();
    const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
    await supabaseClient.from('meli_credentials').update({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expires_at }).eq('user_id', userId);
    return data.access_token;
}

async function updateMeliItem(meliId: string, payload: any, accessToken: string, retries = 3, initialDelayMs = 1500): Promise<{ success: boolean }> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(`https://api.mercadolibre.com/items/${meliId}`, { method: 'PUT', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (response.ok) return { success: true };
            const status = response.status;
            if ((status === 409 || status === 429) && i < retries - 1) {
                await delay(initialDelayMs * Math.pow(2, i));
                continue;
            }
            const errorBody = await response.json().catch(() => null);
            console.error(`ERROR FINAL en ${meliId}. Status: ${status}. Causa: ${JSON.stringify(errorBody, null, 2)}`);
            return { success: false };
        } catch (networkError) {
            if (i < retries - 1) {
                await delay(initialDelayMs * Math.pow(2, i));
                continue;
            }
            return { success: false };
        }
    }
    return { success: false };
}
// --- FIN DE FUNCIONES AUXILIARES ---

serve(async (req) => {
    let page = 0;
    let userId = null;
    try {
        const body = await req.json();
        userId = body.userId;
        page = body.page || 0;
        if (!userId) throw new Error("userId es requerido.");

        console.log(`Iniciando ACTIVADOR DE ESTADO (V32.2) para Usuario ${userId}, Lote ${page + 1}...`);
        
        const { data: tokenData } = await supabaseAdmin.from('meli_credentials').select('access_token, refresh_token, expires_at').eq('user_id', userId).single();
        if (!tokenData) throw new Error("No hay credenciales");
        let accessToken = tokenData.access_token;
        if (new Date(tokenData.expires_at) < new Date(Date.now() + 5 * 60000)) {
            accessToken = await getRefreshedToken(tokenData.refresh_token, userId, supabaseAdmin);
        }

        const { data: listingsBatch, error } = await supabaseAdmin
            .from('mercadolibre_listings')
            .select('id, meli_id, prodflow_stock, status')
            .eq('user_id', userId).eq('sync_enabled', true).in('status', ['active', 'paused'])
            .range(page * BATCH_SIZE, (page + 1) * BATCH_SIZE - 1);

        if (error) throw error;

        const updatePromises = [];
        for (const listing of (listingsBatch || [])) {
            const promise = (async () => {
                let targetStatus: 'active' | 'paused' | null = null;
                const currentStock = parseInt(String(listing.prodflow_stock), 10) || 0;

                if (currentStock > 0 && listing.status === 'paused') {
                    targetStatus = 'active';
                } else if (currentStock === 0 && listing.status === 'active') {
                    targetStatus = 'paused';
                }

                if (targetStatus) {
                    const payload = { status: targetStatus };
                    const result = await updateMeliItem(listing.meli_id, payload, accessToken);
                    if (result.success) {
                        return { id: listing.id, status: targetStatus, last_synced_at: new Date().toISOString() };
                    }
                }
                return null;
            })();
            updatePromises.push(promise);
        }

        const results = await Promise.all(updatePromises);
        const successfulUpdates = results.filter(r => r !== null);

        if (successfulUpdates.length > 0) {
            console.log(`-> Actualizando localmente ${successfulUpdates.length} estados en Supabase...`);
            for (const updateData of successfulUpdates) {
                const { id, ...dataToUpdate } = updateData as any;
                await supabaseAdmin.from('mercadolibre_listings').update(dataToUpdate).eq('id', id);
            }
        }
        
        if (listingsBatch && listingsBatch.length === BATCH_SIZE) {
            console.log(`Lote ${page + 1} de status-activator completado. Pasando relevo al siguiente lote.`);
            supabaseAdmin.functions.invoke('status-activator', { body: { userId, page: page + 1 } }).catch();
        } else {
            console.log(`🏁 ¡Línea de Ensamblaje completada! Sincronización finalizada.`);
        }

        return new Response(JSON.stringify({ success: true, message: `Lote ${page + 1} de status-activator completado.` }), { headers: corsHeaders });
    } catch (error) {
        console.error(`Error fatal en ACTIVADOR DE ESTADO V32.2 (Lote ${page}): ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
});