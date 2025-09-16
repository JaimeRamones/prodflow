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
          // Error de precio mínimo
          if (cause.code === 'item.price.invalid') {
            const match = cause.message.match(/\$ (\d+)/);
            if (match && match[1]) {
              const minPrice = parseInt(match[1], 10);
              console.warn(`Precio bajo para ${meliId}. ML exige > $${minPrice}. Reintentando con precio mínimo.`);
              
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
                warnings.push(`Precio ajustado automáticamente al mínimo permitido: $${minPrice}`);
                return { success: true, warnings };
              }
            }
          }
          
          // Errores de título
          if (cause.code === 'item.title.invalid' || cause.message.includes('title')) {
            warnings.push(`Título no actualizado: ${cause.message}`);
          }
          
          // Errores de descripción
          if (cause.code === 'item.description.invalid' || cause.message.includes('description')) {
            warnings.push(`Descripción no actualizada: ${cause.message}`);
          }
          
          // Errores de SKU/SELLER_SKU
          if (cause.message.includes('SELLER_SKU') || cause.message.includes('sku')) {
            warnings.push(`SKU no actualizado: ${cause.message}`);
          }
        }
        
        // Si hay warnings pero algunos campos se pueden actualizar, intentar sin los campos problemáticos
        if (warnings.length > 0) {
          const reducedPayload = { ...payload };
          
          // Quitar campos problemáticos y reintentar solo con precio y stock
          delete reducedPayload.title;
          delete reducedPayload.description;
          delete reducedPayload.attributes;
          
          if (Object.keys(reducedPayload).length > 0) {
            const fallbackResponse = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(reducedPayload)
            });
            
            if (fallbackResponse.ok) {
              warnings.push('Solo se actualizaron precio y stock debido a restricciones de ML');
              return { success: true, warnings };
            }
          }
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
      
    } catch (networkError) {
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

    console.log(`🔄 Sincronizando item ${meliId}${variationId ? `#${variationId}` : ''} (SKU: ${sku})`);

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

    // Construir el payload de actualización
    const payload: any = {};
    const updatedFields: string[] = [];

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

    // ✅ NUEVO: SKU usando SELLER_SKU (visible en MercadoLibre)
    if (sku !== undefined && sku !== null && sku.toString().trim() !== '') {
      payload.attributes = payload.attributes || [];
      
      const skuAttribute = {
        id: 'SELLER_SKU',
        value_name: sku.toString().trim()
      };
      
      // Buscar si ya existe SELLER_SKU y reemplazarlo, sino agregarlo
      const existingSkuIndex = payload.attributes.findIndex(attr => attr.id === 'SELLER_SKU');
      if (existingSkuIndex >= 0) {
        payload.attributes[existingSkuIndex] = skuAttribute;
      } else {
        payload.attributes.push(skuAttribute);
      }
      
      updatedFields.push('SKU');
      console.log(`📦 SKU actualizado: ${sku.toString().trim()}`);
    }

    // Título
    if (title !== undefined && title !== null && title.toString().trim() !== '') {
      payload.title = title.toString().trim();
      updatedFields.push('título');
    }

    // Descripción
    if (description !== undefined && description !== null) {
      // MercadoLibre acepta descripciones en formato HTML o texto plano
      payload.description = description.toString();
      updatedFields.push('descripción');
    }

    // Si tiene variation ID, usar formato de variaciones (solo para precio y stock)
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
      
      console.log(`📤 Payload con variaciones: ${JSON.stringify(payload)}`);
    } else {
      console.log(`📤 Payload: ${JSON.stringify(payload)}`);
    }

    // Actualizar en MercadoLibre
    const result = await updateMeliItem(meliId, payload, accessToken);
    
    if (!result.success) {
      throw new Error(result.error || 'Error desconocido al actualizar en MercadoLibre');
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
    
    if (title !== undefined && title !== null && title.toString().trim() !== '') {
      updateData.title = title.toString().trim();
    }

    // ✅ NUEVO: Actualizar stock de seguridad en BD local
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
        // No fallar por esto, la sincronización con ML fue exitosa
      }
    }

    console.log(`✅ Item ${meliId} sincronizado exitosamente`);

    return new Response(JSON.stringify({
      success: true,
      message: `Item ${meliId} sincronizado exitosamente`,
      updatedFields,
      finalStatus: payload.status,
      warnings: result.warnings || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
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