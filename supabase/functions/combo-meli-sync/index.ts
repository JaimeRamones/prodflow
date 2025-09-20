// supabase/functions/combo-meli-sync/index.ts
// Función para sincronizar combos con MercadoLibre

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = { 
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' 
};

const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '', 
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface ComboData {
    id: number;
    combo_sku: string;
    combo_name: string;
    description: string;
    meli_description: string;
    meli_title: string;
    final_price: number;
    available_stock: number;
    category: string;
    brands: string[];
    is_active: boolean;
    is_published_to_meli: boolean;
    meli_listing_id: string;
}

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
        throw new Error(`Error al refrescar token: ${response.status}`);
    }

    const data = await response.json();
    const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();

    await supabaseAdmin
        .from('meli_credentials')
        .update({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: expires_at
        })
        .eq('user_id', userId);

    return data.access_token;
}

async function generateComboTitle(combo: ComboData): Promise<string> {
    // Generar título inteligente para MercadoLibre (máximo 60 caracteres)
    if (combo.meli_title && combo.meli_title.length <= 60) {
        return combo.meli_title;
    }

    let title = '';
    
    // Incluir marcas principales
    if (combo.brands && combo.brands.length > 0) {
        const mainBrands = combo.brands.slice(0, 2).join(' ');
        title += `${mainBrands} `;
    }

    // Incluir categoría
    if (combo.category) {
        title += `Kit ${combo.category} `;
    }

    // Incluir parte del nombre del combo
    const remainingChars = 60 - title.length - 3; // 3 para "..."
    if (remainingChars > 10) {
        const comboNamePart = combo.combo_name.substring(0, remainingChars);
        title += comboNamePart;
    }

    // Truncar si es necesario
    if (title.length > 60) {
        title = title.substring(0, 57) + '...';
    }

    return title.trim();
}

async function createMeliListing(combo: ComboData, accessToken: string): Promise<string> {
    const title = await generateComboTitle(combo);
    
    // Mapear categoría a categoría de MercadoLibre
    const categoryMapping: { [key: string]: string } = {
        'Filtros': 'MLA1747',
        'Frenos': 'MLA1744',
        'Distribución': 'MLA1763',
        'Motor': 'MLA1748',
        'Suspensión': 'MLA1746',
        'Default': 'MLA1743' // Autopartes general
    };

    const meliCategoryId = categoryMapping[combo.category] || categoryMapping['Default'];

    const listingData = {
        title: title,
        category_id: meliCategoryId,
        price: combo.final_price,
        currency_id: 'ARS',
        available_quantity: combo.available_stock,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        description: {
            plain_text: combo.meli_description || combo.description
        },
        pictures: [], // Se pueden agregar imágenes después
        attributes: [
            {
                id: 'BRAND',
                value_name: combo.brands && combo.brands.length > 0 ? combo.brands[0] : 'Genérico'
            },
            {
                id: 'MODEL',
                value_name: combo.combo_name
            },
            {
                id: 'SELLER_SKU',
                value_name: combo.combo_sku
            }
        ],
        tags: ['immediate_payment'],
        shipping: {
            mode: 'me2',
            free_shipping: false
        }
    };

    const response = await fetch('https://api.mercadolibre.com/items', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(listingData)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Error creando listing: ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    return result.id;
}

async function updateMeliListing(meliId: string, combo: ComboData, accessToken: string): Promise<boolean> {
    const updateData = {
        available_quantity: combo.available_stock,
        price: combo.final_price
    };

    // Si el combo está inactivo, pausar la publicación
    if (!combo.is_active) {
        updateData.status = 'paused';
    }

    const response = await fetch(`https://api.mercadolibre.com/items/${meliId}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
    });

    return response.ok;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, combo_id, user_id } = await req.json();

        console.log(`Iniciando sync de combo - Action: ${action}, Combo: ${combo_id}`);

        // Obtener credenciales de MercadoLibre
        const { data: tokenData, error: tokenError } = await supabaseAdmin
            .from('meli_credentials')
            .select('access_token, refresh_token, expires_at')
            .eq('user_id', user_id)
            .single();

        if (tokenError || !tokenData) {
            throw new Error('Credenciales de MercadoLibre no encontradas');
        }

        // Verificar si el token necesita renovación
        let accessToken = tokenData.access_token;
        if (new Date(tokenData.expires_at) < new Date(Date.now() + 5 * 60000)) {
            accessToken = await getRefreshedToken(tokenData.refresh_token, user_id);
        }

        // Obtener datos del combo
        const { data: combo, error: comboError } = await supabaseAdmin
            .from('garaje_combos_complete')
            .select('*')
            .eq('id', combo_id)
            .eq('user_id', user_id)
            .single();

        if (comboError || !combo) {
            throw new Error('Combo no encontrado');
        }

        let result = { success: false, message: '', meli_listing_id: null };

        switch (action) {
            case 'create':
                if (combo.is_published_to_meli) {
                    throw new Error('El combo ya está publicado en MercadoLibre');
                }

                if (combo.available_stock <= 0) {
                    throw new Error('No se puede publicar un combo sin stock');
                }

                const meliId = await createMeliListing(combo, accessToken);

                // Actualizar combo con ID de MercadoLibre
                await supabaseAdmin
                    .from('garaje_combos')
                    .update({
                        meli_listing_id: meliId,
                        is_published_to_meli: true
                    })
                    .eq('id', combo_id);

                // Crear registro en mercadolibre_listings
                await supabaseAdmin
                    .from('mercadolibre_listings')
                    .insert({
                        user_id: user_id,
                        meli_id: meliId,
                        sku: combo.combo_sku,
                        title: combo.combo_name,
                        price: combo.final_price,
                        available_quantity: combo.available_stock,
                        listing_type: 'combo',
                        sync_enabled: true,
                        prodflow_price: combo.final_price,
                        prodflow_stock: combo.available_stock,
                        last_synced_at: new Date().toISOString()
                    });

                result = {
                    success: true,
                    message: 'Combo publicado en MercadoLibre con éxito',
                    meli_listing_id: meliId
                };
                break;

            case 'update':
                if (!combo.is_published_to_meli || !combo.meli_listing_id) {
                    throw new Error('El combo no está publicado en MercadoLibre');
                }

                const updateSuccess = await updateMeliListing(combo.meli_listing_id, combo, accessToken);

                if (updateSuccess) {
                    // Actualizar registro en mercadolibre_listings
                    await supabaseAdmin
                        .from('mercadolibre_listings')
                        .update({
                            price: combo.final_price,
                            available_quantity: combo.available_stock,
                            prodflow_price: combo.final_price,
                            prodflow_stock: combo.available_stock,
                            last_synced_at: new Date().toISOString()
                        })
                        .eq('meli_id', combo.meli_listing_id);

                    result = {
                        success: true,
                        message: 'Combo actualizado en MercadoLibre',
                        meli_listing_id: combo.meli_listing_id
                    };
                } else {
                    throw new Error('Error al actualizar el combo en MercadoLibre');
                }
                break;

            case 'pause':
                if (!combo.is_published_to_meli || !combo.meli_listing_id) {
                    throw new Error('El combo no está publicado en MercadoLibre');
                }

                const pauseResponse = await fetch(`https://api.mercadolibre.com/items/${combo.meli_listing_id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ status: 'paused' })
                });

                if (pauseResponse.ok) {
                    await supabaseAdmin
                        .from('garaje_combos')
                        .update({ is_active: false })
                        .eq('id', combo_id);

                    result = {
                        success: true,
                        message: 'Combo pausado en MercadoLibre',
                        meli_listing_id: combo.meli_listing_id
                    };
                } else {
                    throw new Error('Error al pausar el combo en MercadoLibre');
                }
                break;

            case 'activate':
                if (!combo.is_published_to_meli || !combo.meli_listing_id) {
                    throw new Error('El combo no está publicado en MercadoLibre');
                }

                const activateResponse = await fetch(`https://api.mercadolibre.com/items/${combo.meli_listing_id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ status: 'active' })
                });

                if (activateResponse.ok) {
                    await supabaseAdmin
                        .from('garaje_combos')
                        .update({ is_active: true })
                        .eq('id', combo_id);

                    result = {
                        success: true,
                        message: 'Combo activado en MercadoLibre',
                        meli_listing_id: combo.meli_listing_id
                    };
                } else {
                    throw new Error('Error al activar el combo en MercadoLibre');
                }
                break;

            default:
                throw new Error(`Acción no reconocida: ${action}`);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error en combo-meli-sync:', error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});