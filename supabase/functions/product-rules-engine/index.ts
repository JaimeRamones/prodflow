// Ruta: supabase/functions/product-rules-engine/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  try {
    // 1. Recibe el producto base y las reglas del proveedor
    const { product, supplier, meli_credentials } = await req.json();

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Busca las reglas de negocio (márgenes, kits, etc.)
    const { data: businessRulesData } = await supabaseAdmin
      .from('business_rules')
      .select('rules')
      .eq('user_id', meli_credentials.MeliId)
      .single();
    
    if (!businessRulesData) {
      throw new Error("No se encontraron las reglas de negocio para el usuario.");
    }
    const rules = businessRulesData.rules;

    const virtualProducts = [];
    
    // 3. Calcula el precio base y el precio premium
    const basePrice = product.cost_price * (1 + (supplier.markup / 100));
    const premiumPrice = basePrice * (1 + (rules.premiumMarkup / 100));

    // Añade la versión premium a la lista
    virtualProducts.push({
      sku: `${product.sku}-PR`,
      price: parseFloat(premiumPrice.toFixed(2)),
      stock: product.stock_disponible,
      source_sku: product.sku
    });

    // 4. Calcula todos los kits posibles según las reglas
    for (const rule of rules.kitRules) {
      const kitSku = `${product.sku}${rule.suffix}`;
      const kitStock = Math.floor(product.stock_disponible / rule.quantity);
      
      if (kitStock > 0) {
        const kitPrice = basePrice * rule.quantity * (1 - (rule.discount / 100));
        virtualProducts.push({
          sku: kitSku,
          price: parseFloat(kitPrice.toFixed(2)),
          stock: kitStock,
          source_sku: product.sku
        });
      }
    }

    // 5. Devuelve la lista completa de productos virtuales generados
    return new Response(JSON.stringify(virtualProducts), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});