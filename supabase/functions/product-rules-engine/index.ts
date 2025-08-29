// Ruta: supabase/functions/product-rules-engine/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'
import { corsHeaders } from '../_shared/cors.ts'

interface Product {
  sku: string;
  cost_price: number;
  stock_disponible: number;
  supplier_id: string;
}

interface Supplier {
  markup: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { product, supplier } = await req.json() as { product: Product, supplier: Supplier };
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. OBTENER TODAS LAS REGLAS DE NEGOCIO ACTIVAS DE LA BASE DE DATOS
    const { data: rulesData, error: rulesError } = await supabaseAdmin
      .from('business_rules')
      .select('rule_type, config')
      .eq('is_active', true);

    if (rulesError) throw rulesError;

    // 2. PROCESAR Y ORGANIZAR LAS REGLAS PARA FÁCIL ACCESO
    const rules = rulesData.reduce((acc, rule) => {
      acc[rule.rule_type] = rule.config;
      return acc;
    }, {});
    
    // Asignar configuraciones con valores por defecto por si no existen
    const premiumFeeConfig = rules.premium_fee || { fee_percentage: 0 };
    const kitConfig = rules.kit_config || { apply_to_all: false, multipliers: [], excluded_prefixes: [] };
    const specialRulesConfig = rules.special_rules || { rules: [] };

    // 3. CALCULAR EL PRECIO DE VENTA BASE
    // Se usa el markup del proveedor que llega como parámetro.
    const baseSalePrice = product.cost_price * (1 + (supplier.markup / 100));

    let generatedProducts = [];

    // Producto base (sin sufijos de kit)
    const baseProduct = {
      sku: product.sku,
      price: parseFloat(baseSalePrice.toFixed(2)),
      stock: product.stock_disponible,
      component_sku: product.sku, // Guardamos referencia al SKU original
      kit_multiplier: 1
    };
    generatedProducts.push(baseProduct);

    // 4. GENERAR KITS (/Xn)
    const shouldApplyKits = kitConfig.apply_to_all && !kitConfig.excluded_prefixes.some(prefix => product.sku.startsWith(prefix));

    if (shouldApplyKits) {
      kitConfig.multipliers.forEach(multiplier => {
        if (multiplier > 1) { // El multiplicador 1 ya es el producto base
          generatedProducts.push({
            sku: `${product.sku}/X${multiplier}`,
            price: parseFloat((baseSalePrice * multiplier).toFixed(2)),
            stock: Math.floor(product.stock_disponible / multiplier),
            component_sku: product.sku,
            kit_multiplier: multiplier
          });
        }
      });
    }

    // 5. GENERAR VERSIONES PREMIUM (-PR) Y APLICAR REGLAS ESPECIALES
    const finalProducts = [];
    generatedProducts.forEach(p => {
      // Añadir la versión normal a la lista final
      finalProducts.push(p);

      // Crear y añadir la versión Premium
      finalProducts.push({
        ...p,
        sku: `${p.sku}-PR`,
        price: parseFloat((p.price * (1 + (premiumFeeConfig.fee_percentage / 100))).toFixed(2)),
      });
    });

    // Aplicar reglas especiales a toda la lista final
    const productsWithSpecialRules = finalProducts.map(p => {
      const specialRule = specialRulesConfig.rules.find(rule => p.sku.startsWith(rule.prefix));
      if (specialRule) {
        return {
          ...p,
          price: parseFloat((p.price * specialRule.price_multiplier).toFixed(2))
        };
      }
      return p;
    });

    return new Response(JSON.stringify(productsWithSpecialRules), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error in product-rules-engine:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});