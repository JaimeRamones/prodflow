import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'
// --- PASO 1: Importamos el "motor" compartido ---
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

    // El payload sigue siendo el mismo: un objeto 'listing' con la data
    const { listing } = await req.json();
    if (!listing || !listing.meli_id || listing.prodflow_stock === undefined) {
      throw new Error("Listing data with meli_id and prodflow_stock is required.");
    }

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let { data: mlTokens } = await supabaseAdmin.from('meli_credentials').select('access_token, refresh_token, expires_at').eq('user_id', user.id).single()
    if (!mlTokens) throw new Error('Mercado Libre token not found.');
    
    if (new Date(mlTokens.expires_at) < new Date()) {
      mlTokens.access_token = await getRefreshedToken(mlTokens.refresh_token, supabaseAdmin, user.id)
    }

    // --- PASO 2: Le decimos al motor qué hacer ---
    // Preparamos el objeto de actualización específico para esta función.
    const updates = {
      available_quantity: listing.prodflow_stock,
    };

    // Llamamos al motor para que haga el trabajo pesado.
    const result = await updateMeliListing(listing, updates, mlTokens.access_token);

    // Actualizamos nuestra base de datos local solo si ML tuvo éxito.
    if (result.success) {
      await supabaseAdmin
        .from('mercadolibre_listings')
        .update({ available_quantity: updates.available_quantity })
        .eq('user_id', user.id)
        .eq('meli_id', listing.meli_id)
        .eq(listing.meli_variation_id ? 'meli_variation_id' : 'meli_id', listing.meli_variation_id ?? listing.meli_id);
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-stock function:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
