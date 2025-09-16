// Ruta: supabase/functions/mercadolibre-inflow/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función para hacer llamadas a la API de MELI
async function meliApiCall(url, method, token, body = null) {
  const options = {
    method: method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
  };
  const response = await fetch(url, options);
  const responseBody = await response.json();
  if (!response.ok) {
    const error = new Error(`Error ${response.status} de MELI: ${responseBody.message || 'Error desconocido'}`);
    console.error("Detalle del error de MELI:", responseBody);
    throw error;
  }
  return responseBody;
}

// Función para obtener atributos obligatorios de una categoría
async function getCategoryAttributes(categoryId, token) {
  try {
    const categoryData = await meliApiCall(`https://api.mercadolibre.com/categories/${categoryId}/attributes`, 'GET', token);
    return categoryData.filter(attr => attr.tags && attr.tags.required);
  } catch (err) {
    console.warn(`No se pudieron obtener atributos para categoría ${categoryId}:`, err.message);
    return [];
  }
}

// Función para mapear campos del Excel a estructura de MELI
function mapExcelToMeliFields(pub, rowIndex) {
  // Mapeo flexible de campos comunes de Integraly
  const fieldMappings = {
    // Campos básicos
    title: pub['Titulo'] || pub['Título'] || pub['Title'] || pub['title'],
    category_id: pub['Categoría'] || pub['Category'] || pub['category_id'] || pub['_categoria'],
    price: pub['Precio'] || pub['Price'] || pub['price'],
    available_quantity: pub['Stock'] || pub['Quantity'] || pub['available_quantity'],
    condition: pub['Condición'] || pub['Condition'] || pub['condition'] || 'new',
    currency_id: pub['Moneda'] || pub['Currency'] || pub['currency_id'] || 'ARS',
    buying_mode: pub['Modo de Compra'] || pub['buying_mode'] || 'buy_it_now',
    listing_type_id: pub['Tipo de Publicación'] || pub['listing_type_id'] || 'gold_special',
    
    // Campos de descripción y garantía
    description: pub['Descripción'] || pub['Description'] || pub['description'],
    warranty: pub['Garantía'] || pub['Guarantee'] || pub['warranty'] || 'Garantía del vendedor: 30 días',
    
    // Imágenes y multimedia
    pictures: pub['Imagen 1'] || pub['Fotos'] || pub['Photos'] || pub['pictures'] || pub['imagen'],
    video_id: pub['Video'] || pub['video_id'],
    
    // Identificadores
    sku: pub['SKU'] || pub['sku'] || pub['seller_sku'],
    seller_custom_field: pub['seller_custom_field'],
    
    // Atributos comunes
    brand: pub['Atributo Marca'] || pub['Marca'] || pub['Brand'] || pub['brand'],
    model: pub['Atributo Modelo'] || pub['Modelo'] || pub['Model'] || pub['model'],
    
    // Envío
    free_shipping: pub['Envio Gratis'] || pub['free_shipping'],
    local_pick_up: pub['Retira en Persona'] || pub['local_pick_up'],
    
    // Variaciones (para futuro uso)
    variation_color: pub['Variación Color'] || pub['Color'],
    variation_size: pub['Variación Talle'] || pub['Talle'] || pub['Size']
  };

  return { ...fieldMappings, _rowIndex: rowIndex };
}

// Función para construir el payload de MELI
function buildMeliPayload(fields, requiredAttributes) {
  const payload = {
    title: fields.title?.trim(),
    category_id: fields.category_id?.trim(),
    price: parseFloat(fields.price) || 0,
    currency_id: fields.currency_id || 'ARS',
    available_quantity: parseInt(fields.available_quantity, 10) || 0,
    buying_mode: fields.buying_mode || 'buy_it_now',
    listing_type_id: fields.listing_type_id || 'gold_special',
    condition: fields.condition || 'new',
    warranty: fields.warranty || 'Garantía del vendedor: 30 días'
  };

  // Agregar descripción si existe
  if (fields.description?.trim()) {
    payload.description = {
      plain_text: fields.description.trim()
    };
  }

  // Agregar imágenes si existen
  if (fields.pictures?.trim()) {
    const pictureUrls = fields.pictures.split(',').map(url => url.trim()).filter(url => url);
    if (pictureUrls.length > 0) {
      payload.pictures = pictureUrls.map(url => ({ source: url }));
    }
  }

  // Agregar video si existe
  if (fields.video_id?.trim()) {
    payload.video_id = fields.video_id.trim();
  }

  // Construir atributos
  const attributes = [];
  
  // Agregar SKU si existe
  if (fields.sku?.trim()) {
    attributes.push({
      id: 'SELLER_SKU',
      value_name: fields.sku.trim()
    });
  }

  // Agregar marca si existe
  if (fields.brand?.trim()) {
    attributes.push({
      id: 'BRAND',
      value_name: fields.brand.trim()
    });
  }

  // Agregar modelo si existe
  if (fields.model?.trim()) {
    attributes.push({
      id: 'MODEL',
      value_name: fields.model.trim()
    });
  }

  // Agregar atributos obligatorios de la categoría si no están presentes
  requiredAttributes.forEach(attr => {
    const existingAttr = attributes.find(a => a.id === attr.id);
    if (!existingAttr) {
      // Buscar valor en campos del Excel
      const possibleFields = [
        `Atributo ${attr.name}`,
        `Atributo ${attr.id}`,
        attr.name,
        attr.id
      ];
      
      let attributeValue = null;
      for (const fieldName of possibleFields) {
        if (fields[fieldName]?.trim()) {
          attributeValue = fields[fieldName].trim();
          break;
        }
      }

      if (attributeValue) {
        attributes.push({
          id: attr.id,
          value_name: attributeValue
        });
      }
    }
  });

  if (attributes.length > 0) {
    payload.attributes = attributes;
  }

  // Configuración de envío
  const shipping = {};
  
  if (fields.free_shipping === 'Sí' || fields.free_shipping === 'Si' || fields.free_shipping === true) {
    shipping.free_shipping = true;
  }
  
  if (fields.local_pick_up === 'Sí' || fields.local_pick_up === 'Si' || fields.local_pick_up === true) {
    shipping.local_pick_up = true;
  }

  if (Object.keys(shipping).length > 0) {
    payload.shipping = shipping;
  }

  // Agregar seller_custom_field si existe
  if (fields.seller_custom_field?.trim()) {
    payload.seller_custom_field = fields.seller_custom_field.trim();
  }

  return payload;
}

// Función para validar campos obligatorios
function validateRequiredFields(fields) {
  const errors = [];
  
  if (!fields.title?.trim()) {
    errors.push('Título es obligatorio');
  }
  
  if (!fields.category_id?.trim()) {
    errors.push('Categoría es obligatoria');
  }
  
  const price = parseFloat(fields.price);
  if (!price || price <= 0) {
    errors.push('Precio debe ser mayor a 0');
  }
  
  const quantity = parseInt(fields.available_quantity, 10);
  if (quantity < 0) {
    errors.push('Stock no puede ser negativo');
  }

  return errors;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { publications } = await req.json();
    if (!publications || !Array.isArray(publications)) {
      throw new Error("El cuerpo debe contener un array de 'publications'.");
    }

    // Autenticar al usuario de tu app
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    // Obtener el token de MELI para ese usuario
    const { data: authData, error: authError } = await supabaseClient
      .from('meli_credentials')
      .select('access_token')
      .eq('user_id', user.id)
      .single();
    if (authError || !authData) throw new Error("No se encontró la autenticación de MELI para este usuario.");
    const accessToken = authData.access_token;

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const warnings = [];

    console.log(`Iniciando procesamiento de ${publications.length} publicaciones`);

    // Cache para atributos de categorías
    const categoryAttributesCache = new Map();

    // Procesar cada fila del archivo subido
    for (let i = 0; i < publications.length; i++) {
      const pub = publications[i];
      const rowIndex = i + 1;
      
      try {
        console.log(`\n--- Procesando fila ${rowIndex} ---`);
        
        // Mapear campos del Excel
        const fields = mapExcelToMeliFields(pub, rowIndex);
        
        // Validar campos obligatorios básicos
        const validationErrors = validateRequiredFields(fields);
        if (validationErrors.length > 0) {
          errorCount++;
          errors.push(`Fila ${rowIndex}: ${validationErrors.join(', ')}`);
          continue;
        }

        // Obtener atributos obligatorios de la categoría (con cache)
        let requiredAttributes = [];
        if (!categoryAttributesCache.has(fields.category_id)) {
          requiredAttributes = await getCategoryAttributes(fields.category_id, accessToken);
          categoryAttributesCache.set(fields.category_id, requiredAttributes);
        } else {
          requiredAttributes = categoryAttributesCache.get(fields.category_id);
        }

        console.log(`Categoría ${fields.category_id} tiene ${requiredAttributes.length} atributos obligatorios`);

        // Construir payload
        const payload = buildMeliPayload(fields, requiredAttributes);
        
        console.log(`Payload para "${fields.title}":`, JSON.stringify(payload, null, 2));

        // Crear publicación
        const result = await meliApiCall('https://api.mercadolibre.com/items', 'POST', accessToken, payload);
        
        console.log(`✅ Publicación creada exitosamente: ${result.id}`);
        successCount++;

        // Verificar warnings en la respuesta
        if (result.warnings && result.warnings.length > 0) {
          warnings.push(`Fila ${rowIndex} (${result.id}): ${result.warnings.map(w => w.message).join(', ')}`);
        }
        
      } catch (err) {
        errorCount++;
        const errorMsg = `Fila ${rowIndex} (${fields?.title || 'Sin título'}): ${err.message}`;
        console.error('❌ Error en publicación:', errorMsg);
        errors.push(errorMsg);
      }
    }

    const summary = `${successCount} publicaciones creadas, ${errorCount} con errores`;
    console.log('\n=== RESUMEN ===');
    console.log(summary);
    
    if (warnings.length > 0) {
      console.log('Advertencias:', warnings);
    }
    
    if (errors.length > 0) {
      console.log('Errores:', errors);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      summary,
      details: {
        successCount,
        errorCount,
        warnings: warnings.slice(0, 10), // Limitar warnings en respuesta
        errors: errors.slice(0, 10) // Limitar errores en respuesta
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error general:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});