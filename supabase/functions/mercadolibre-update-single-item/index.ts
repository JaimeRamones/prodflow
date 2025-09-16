// Ruta: supabase/functions/mercadolibre-update-single-item/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '', 
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getRefreshedToken(refreshToken: string, userId: string): Promise<string> {
  const clientId = Deno.env.get('MELI_APP_ID');
  const clientSecret = Deno.env.get('MELI_SECRET_KEY');
  
  if (!clientId || !clientSecret) {
    throw new Error('Configuración de MercadoLibre faltante');
  }

  const response = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(`Error renovando token: ${response.status}`);
  }

  const data = await response.json();
  const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabaseAdmin.from('meli_credentials').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expires_at
  }).eq('user_id', userId);

  return data.access_token;
}

// NUEVA FUNCIÓN: Obtener información del producto para verificar sold_quantity y restricciones
async function getItemInfo(meliId: string, accessToken: string): Promise<{
  soldQuantity: number;
  hasDescription: boolean;
  currentTitle?: string;
  currentSku?: string;
  familyName?: string;
  hasCatalogRestrictions: boolean;
}> {
  try {
    const response = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      return { soldQuantity: 0, hasDescription: false, hasCatalogRestrictions: false };
    }

    const data = await response.json();
    
    // Buscar SKU actual en atributos
    const currentSku = data.attributes?.find((attr: any) => attr.id === 'SELLER_SKU')?.value_name || data.seller_custom_field;

    return {
      soldQuantity: data.sold_quantity || 0,
      hasDescription: data.descriptions?.length > 0,
      currentTitle: data.title,
      currentSku,
      familyName: data.family_name,
      hasCatalogRestrictions: !!(data.family_name || data.catalog_product_id)
    };
  } catch (error) {
    console.warn('Error obteniendo info del item:', error);
    return { soldQuantity: 0, hasDescription: false, hasCatalogRestrictions: false };
  }
}

// NUEVA FUNCIÓN: Actualizar descripción usando endpoint específico
async function updateDescription(meliId: string, description: string, accessToken: string, hasExistingDescription: boolean): Promise<{ success: boolean; warning?: string }> {
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  const payload = { plain_text: description };
  const method = hasExistingDescription ? 'PUT' : 'POST';
  const url = `https://api.mercadolibre.com/items/${meliId}/description`;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      return { success: true };
    } else {
      const errorBody = await response.json().catch(() => null);
      return { 
        success: false, 
        warning: `Descripción no actualizada: ${errorBody?.message || 'Error desconocido'}` 
      };
    }
  } catch (error: any) {
    return { 
      success: false, 
      warning: `Error actualizando descripción: ${error.message}` 
    };
  }
}

async function updateMeliItem(
  meliId: string, 
  payload: any, 
  accessToken: string, 
  retries: number = 3, 
  initialDelayMs: number = 1500
): Promise<{ success: boolean; error?: string; warnings?: string[] }> {
  const warnings: string[] = [];
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return { success: true, warnings };
      }

      const status = response.status;
      const errorBody = await response.json().catch(() => null);
      
      // Manejar errores específicos por campo
      if (status === 400 && errorBody?.cause) {
        for (const cause of errorBody.cause) {
          // Verificar que cause.message existe antes de usar includes()
          const causeMessage = cause.message || '';
          
          // Error de precio mínimo
          if (cause.code === 'item.price.invalid') {
            const match = causeMessage.match(/\$ (\d+)/);
            if (match && match[1]) {
              const minPrice = parseInt(match[1], 10);
              console.warn(`Precio bajo para ${meliId}. ML exige > ${minPrice}. Reintentando con precio mínimo.`);
              
              const newPayload = JSON.parse(JSON.stringify(payload));
              if (newPayload.variations && newPayload.variations.length > 0) {
                newPayload.variations[0].price = minPrice;
              } else {
                newPayload.price = minPrice;
              }
              
              const retryResponse = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(newPayload)
              });
              
              if (retryResponse.ok) {
                warnings.push(`Precio ajustado automáticamente al mínimo permitido: ${minPrice}`);
                return { success: true, warnings };
              }
            }
          }
          
          // Errores de título/SKU por ventas - con validación segura
          if (causeMessage.includes('sold_quantity') || causeMessage.includes('not_modifiable')) {
            warnings.push(`Campo no modificable: producto con ventas (sold_quantity > 0)`);
          }
          
          // Log adicional para debug
          console.error(`Causa específica: ${JSON.stringify(cause)}`);
        }
      }

      // Rate limiting - reintentar
      if ((status === 429 || status === 403) && i < retries - 1) {
        const waitTime = initialDelayMs * Math.pow(2, i);
        console.warn(`Rate limit (${status}) en ${meliId}. Reintentando en ${waitTime / 1000}s...`);
        await delay(waitTime);
        continue;
      }

      console.error(`Error final en ${meliId}. Status: ${status}. Causa: ${JSON.stringify(errorBody, null, 2)}`);
      return {
        success: false,
        error: `Error ${status}: ${errorBody?.message || 'Error desconocido'}`,
        warnings
      };
      
    } catch (networkError: any) {
      if (i < retries - 1) {
        await delay(initialDelayMs * Math.pow(2, i));
        continue;
      }
      console.error(`Error de red en ${meliId}:`, networkError.message);
      return {
        success: false,
        error: `Error de red: ${networkError.message}`,
        warnings
      };
    }
  }
  
  return {
    success: false,
    error: 'Máximo de reintentos alcanzado',
    warnings
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { 
      meliId, 
      variationId, 
      availableQuantity, 
      sku, 
      price, 
      status,
      title,
      description,
      safetyStock
    } = await req.json();

    if (!meliId) {
      throw new Error('meliId es requerido');
    }

    console.log(`🔄 Sincronizando item ${meliId}${variationId ? `#${variationId}` : ''}`);

    // Obtener credenciales del usuario
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('meli_credentials')
      .select('access_token, refresh_token, expires_at, user_id')
      .single();

    if (tokenError || !tokenData) {
      throw new Error('No se encontraron credenciales de MercadoLibre');
    }

    // Verificar y renovar token si es necesario
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) < new Date(Date.now() + 5 * 60000)) {
      accessToken = await getRefreshedToken(tokenData.refresh_token, tokenData.user_id);
      console.log('🔑 Token renovado exitosamente');
    }

    // NUEVO: Obtener información del producto para tomar decisiones inteligentes
    const itemInfo = await getItemInfo(meliId, accessToken);
    console.log(`📊 Info del producto - Vendidos: ${itemInfo.soldQuantity}, SKU actual: ${itemInfo.currentSku}, Catálogo: ${itemInfo.hasCatalogRestrictions}, Family: ${itemInfo.familyName}`);
    
    // Construir el payload de actualización
    const payload: any = {};
    const updatedFields: string[] = [];
    const warnings: string[] = [];

    // Stock
    if (availableQuantity !== undefined) {
      const stockValue = Math.max(0, Math.floor(availableQuantity));
      payload.available_quantity = stockValue;
      updatedFields.push('stock');
      
      // Lógica de activar/pausar automáticamente según stock
      if (status === undefined) {
        payload.status = stockValue > 0 ? 'active' : 'paused';
        updatedFields.push('status (automático)');
      }
    }

    // Precio
    if (price !== undefined) {
      payload.price = parseFloat(price.toString());
      updatedFields.push('precio');
    }

    // Estado manual
    if (status !== undefined) {
      payload.status = status;
      updatedFields.push('status');
    }

    // MANEJO INTELIGENTE DE SKU: Basado en sold_quantity según documentación oficial
    if (sku !== undefined && sku !== null && sku.toString().trim() !== '') {
      const skuValue = sku.toString().trim();
      
      if (itemInfo.soldQuantity === 0) {
        // PRODUCTO SIN VENTAS: Puede usar SELLER_SKU (visible)
        payload.attributes = payload.attributes || [];
        
        const skuAttribute = {
          id: 'SELLER_SKU',
          value_id: '',
          value_name: skuValue
        };
        
        const existingSkuIndex = payload.attributes.findIndex((attr: any) => attr.id === 'SELLER_SKU');
        if (existingSkuIndex >= 0) {
          payload.attributes[existingSkuIndex] = skuAttribute;
        } else {
          payload.attributes.push(skuAttribute);
        }
        
        updatedFields.push('SKU (visible)');
        console.log(`📦 SKU visible actualizado: ${skuValue} (sin ventas)`);
        
      } else {
        // PRODUCTO CON VENTAS: Solo seller_custom_field (interno)
        payload.seller_custom_field = skuValue;
        updatedFields.push('SKU (interno)');
        warnings.push(`SKU actualizado solo internamente - producto con ventas (${itemInfo.soldQuantity} vendidos) no permite SKU visible`);
        console.log(`📦 SKU interno actualizado: ${skuValue} (${itemInfo.soldQuantity} ventas)`);
      }
    }

    // MANEJO INTELIGENTE DE TÍTULO: Múltiples restricciones
    if (title !== undefined && title !== null && title.toString().trim() !== '') {
      const titleValue = title.toString().trim();
      console.log(`📝 Intentando actualizar título: "${titleValue}" (sold_quantity: ${itemInfo.soldQuantity}, catálogo: ${itemInfo.hasCatalogRestrictions})`);
      
      if (itemInfo.soldQuantity > 0) {
        warnings.push(`Título no actualizado - producto con ventas (${itemInfo.soldQuantity} vendidos) no permite modificar título`);
        console.warn(`⚠️ Título no actualizable: ${itemInfo.soldQuantity} ventas`);
      } else if (itemInfo.hasCatalogRestrictions) {
        warnings.push(`Título no actualizado - producto asociado a catálogo de MercadoLibre (family_name: ${itemInfo.familyName || 'presente'}) no permite modificar título`);
        console.warn(`⚠️ Título no actualizable: producto en catálogo`);
      } else {
        payload.title = titleValue;
        updatedFields.push('título');
        console.log(`📝 Título incluido en payload: ${titleValue} (producto libre)`);
      }
    }

    // Si tiene variation ID, usar formato de variaciones
    if (variationId) {
      const variationPayload: any = {
        id: variationId
      };
      
      if (availableQuantity !== undefined) {
        variationPayload.available_quantity = Math.max(0, Math.floor(availableQuantity));
      }
      
      if (price !== undefined) {
        variationPayload.price = parseFloat(price.toString());
      }
      
      payload.variations = [variationPayload];
      
      // Limpiar campos de nivel superior si estamos usando variaciones
      delete payload.available_quantity;
      delete payload.price;
      
      console.log(`🔤 Payload con variaciones: ${JSON.stringify(payload)}`);
    } else {
      console.log(`🔤 Payload principal: ${JSON.stringify(payload)}`);
    }

    // Actualizar en MercadoLibre (campos principales)
    let result = { success: true, warnings: [] };
    if (Object.keys(payload).length > 0) {
      result = await updateMeliItem(meliId, payload, accessToken);
      
      if (!result.success) {
        throw new Error(result.error || 'Error desconocido al actualizar en MercadoLibre');
      }
      
      warnings.push(...result.warnings);
    }

    // MANEJO ESPECIAL DE DESCRIPCIÓN: Endpoint específico
    if (description !== undefined && description !== null) {
      console.log('📄 Actualizando descripción usando endpoint específico...');
      const descResult = await updateDescription(meliId, description.toString(), accessToken, itemInfo.hasDescription);
      
      if (descResult.success) {
        updatedFields.push('descripción');
        console.log('✅ Descripción actualizada exitosamente');
      } else {
        warnings.push(descResult.warning || 'Error actualizando descripción');
      }
    }

    // Actualizar también en la base de datos local
    const updateData: any = {};
    
    if (availableQuantity !== undefined) {
      updateData.available_quantity = Math.max(0, Math.floor(availableQuantity));
      updateData.prodflow_stock = Math.max(0, Math.floor(availableQuantity));
    }
    
    if (price !== undefined) {
      updateData.price = parseFloat(price.toString());
      updateData.prodflow_price = parseFloat(price.toString());
    }
    
    if (payload.status !== undefined) {
      updateData.status = payload.status;
    }
    
    if (sku !== undefined && sku !== null && sku.toString().trim() !== '') {
      updateData.sku = sku.toString().trim();
    }
    
    if (title !== undefined && title !== null && title.toString().trim() !== '' && itemInfo.soldQuantity === 0) {
      updateData.title = title.toString().trim();
    }

    if (safetyStock !== undefined) {
      updateData.safety_stock = Math.max(0, parseInt(safetyStock.toString()) || 0);
    }

    updateData.last_synced_at = new Date().toISOString();

    if (Object.keys(updateData).length > 0) {
      let query = supabaseAdmin.from('mercadolibre_listings').update(updateData).eq('meli_id', meliId);
      
      if (variationId) {
        query = query.eq('meli_variation_id', variationId);
      } else {
        query = query.is('meli_variation_id', null);
      }
      
      const { error: updateError } = await query;
      
      if (updateError) {
        console.warn('⚠️ Error actualizando BD local:', updateError.message);
      }
    }

    console.log(`✅ Item ${meliId} sincronizado exitosamente`);

    return new Response(JSON.stringify({
      success: true,
      message: `Item ${meliId} sincronizado exitosamente`,
      updatedFields,
      finalStatus: payload.status,
      warnings: warnings,
      itemInfo: {
        soldQuantity: itemInfo.soldQuantity,
        canModifyTitle: itemInfo.soldQuantity === 0 && !itemInfo.hasCatalogRestrictions,
        canModifyVisibleSku: itemInfo.soldQuantity === 0,
        hasCatalogRestrictions: itemInfo.hasCatalogRestrictions,
        familyName: itemInfo.familyName,
        titleRestrictionReason: itemInfo.soldQuantity > 0 ? 'Producto con ventas' : 
                              itemInfo.hasCatalogRestrictions ? 'Producto en catálogo ML' : 
                              'Sin restricciones'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('❌ Error en actualización individual:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});