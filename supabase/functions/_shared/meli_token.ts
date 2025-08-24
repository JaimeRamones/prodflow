// Ruta: supabase/functions/_shared/meli_token.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function getRefreshedToken(
  refreshToken: string, 
  userId: string,
  supabaseClient: any
) {
  const MELI_APP_ID = Deno.env.get('MELI_APP_ID')
  const MELI_CLIENT_SECRET = Deno.env.get('MELI_CLIENT_SECRET')

  if (!MELI_APP_ID || !MELI_CLIENT_SECRET) {
    throw new Error('Missing Mercado Libre credentials in environment variables.')
  }

  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: MELI_APP_ID,
      client_secret: MELI_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    console.error("Failed to refresh token response:", await response.text());
    throw new Error('Failed to refresh Mercado Libre token')
  }

  const newTokens = await response.json()
  const expires_at = new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
  
  await supabaseClient.from('mercadolibre_tokens').update({
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token,
    expires_at: expires_at,
  }).eq('user_id', userId)
  
  return newTokens.access_token
}