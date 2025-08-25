// supabase/functions/_shared/meli_token.ts
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Esta función se encarga de refrescar un token de ML y se puede reusar en todas las demás funciones
export async function getRefreshedToken(refreshToken: string, userId: string, supabaseAdmin: SupabaseClient) {
  const MELI_CLIENT_ID = Deno.env.get('MELI_CLIENT_ID')!
  const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')!

  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: MELI_CLIENT_ID,
      client_secret: MELI_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(`Failed to refresh ML token: ${errorBody.message}`);
  }

  const newTokens = await response.json()
  const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
  
  const { error } = await supabaseAdmin
    .from('meli_credentials')
    .update({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: expires_at,
    })
    .eq('user_id', userId)
  
  if (error) throw error;
    
  return newTokens.access_token
}