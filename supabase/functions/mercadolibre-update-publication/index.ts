import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'
// --- PASO 1: Importamos el mismo "motor" compartido ---
import { getRefreshedToken, updateMeliListing } from '../_shared/meli-updater.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('User not found')

    const { listing, newPrice, newSku } = await req.json();
    if (!listing || !listing.meli_id) {
        throw new Error("Listing data is required.");
    }
     if (newPrice === undefined && newSku === undefined) {
        throw new Error("Either newPrice or newSku must be provided.");
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let { data: mlTokens } = await supabaseAdmin.from('meli_credentials').select('access_token, refresh_token, expires_at').eq('user_id', user.id).single()
    if (!mlTokens) throw new Error('Mercado Libre token not found.');
    
    if (new Date(mlTokens.expires_at) < new Date()) {
      mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, supabaseAdmin, user.id)
    }

    // --- PASO 2: Le decimos al motor qué hacer ---
    // Preparamos el objeto de actualización específico para esta función.
    const updates: { [key: string]: any } = {};
    if (newPrice !== undefined) updates.price = newPrice;
    if (newSku !== undefined) updates.seller_custom_field = newSku;
    
    // Llamamos al motor.
    const result = await updateMeliListing(listing, updates, mlTokens.access_token);

    // Actualizamos nuestra base de datos local solo si ML tuvo éxito.
    if (result.success) {
      const dbUpdates: { [key: string]: any } = {};
      if (newPrice !== undefined) dbUpdates.price = newPrice;
      if (newSku !== undefined) dbUpdates.sku = newSku;

      await supabaseAdmin
        .from('mercadolibre_listings')
        .update(dbUpdates)
        .eq('user_id', user.id)
        .eq('meli_id', listing.meli_id)
        .eq(listing.meli_variation_id ? 'meli_variation_id' : 'meli_id', listing.meli_variation_id ?? listing.meli_id);
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-publication function:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
