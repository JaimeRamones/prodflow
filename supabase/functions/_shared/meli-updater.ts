import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

// --- FUNCIÓN 1: OBTENER/REFRESCAR TOKEN ---
// Responsabilidad única: Asegurarse de que siempre tengamos un token de acceso válido.
export async function getRefreshedToken(refreshToken: string, supabaseAdmin: SupabaseClient, userId: string) {
    const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID')!
    const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')!
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token', client_id: MELI_CLIENT_ID,
            client_secret: MELI_CLIENT_SECRET, refresh_token: refreshToken,
        }),
    })
    if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(`Failed to refresh ML token: ${errorBody.message}`);
    }
    const newTokens = await response.json()
    const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
    await supabaseAdmin.from('meli_credentials').update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: expires_at,
    }).eq('user_id', userId)
    return newTokens.access_token
}


// --- FUNCIÓN 2: LÓGICA DE ACTUALIZACIÓN ROBUSTA ---
// Responsabilidad única: Enviar datos a ML, manejando reintentos y errores específicos.
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const MAX_RETRIES = 5;

export async function updateMeliListing(listing: any, updates: any, accessToken: string) {
    let url: string;
    let body: any;

    if (listing.meli_variation_id) {
        url = `https://api.mercadolibre.com/items/${listing.meli_id}/variations`;
        body = JSON.stringify([{ id: listing.meli_variation_id, ...updates }]);
    } else {
        url = `https://api.mercadolibre.com/items/${listing.meli_id}`;
        body = JSON.stringify(updates);
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: body,
        });

        if (response.ok) {
            return { success: true, data: await response.json() };
        }

        const errorBody = await response.json();
        const status = response.status;
        
        if (status === 400) {
            const nonModifiableErrors = ['item.price.not_modifiable', 'field_not_updatable'];
            const hasNonModifiableError = errorBody.cause?.some((c: any) => nonModifiableErrors.includes(c.code));
            
            if (hasNonModifiableError) {
                const message = `Skipped: Item ${listing.meli_id} is not modifiable.`;
                console.warn(message, JSON.stringify(errorBody.cause));
                return { success: false, skipped: true, message: message };
            }
        }
        
        if (status === 409 || status === 429) {
            if (attempt < MAX_RETRIES) {
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                console.warn(`Conflict (${status}) on ${listing.meli_id}. Retrying (${attempt}/${MAX_RETRIES}) in ${waitTime}ms...`);
                await delay(waitTime);
                continue;
            }
        }
        
        throw new Error(`Definitive failure on ${listing.meli_id}. Status: ${status}. Response: ${JSON.stringify(errorBody)}`);
    }

    throw new Error(`Failed to update ${listing.meli_id} after ${MAX_RETRIES} attempts.`);
}
