// Ruta: supabase/functions/supplier-batch-processor/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

interface HeaderMappings {
    sku: string
    price: string
    stock: string
    description?: string
    category?: string
}

interface SupplierRecord {
    sku: string
    price: number
    stock: number
    description?: string
    category?: string
    supplier_id: string
    last_updated: string
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { supplier_id, batch_number, data, header_mappings } = await req.json()

        if (!supplier_id || !data || !header_mappings) {
            throw new Error('Parámetros requeridos faltantes')
        }

        console.log(`Procesando lote ${batch_number} para ${supplier_id}: ${data.length} registros`)

        const processedRecords = await processBatch(data, header_mappings, supplier_id)
        
        if (processedRecords.length > 0) {
            await insertRecords(processedRecords, supplier_id)
        }

        console.log(`Lote ${batch_number} completado: ${processedRecords.length} registros procesados`)

        return new Response(JSON.stringify({
            success: true,
            batch_number,
            processed_count: processedRecords.length,
            supplier_id
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('Error procesando lote:', error)
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

async function processBatch(
    rawData: any[], 
    mappings: HeaderMappings, 
    supplier_id: string
): Promise<SupplierRecord[]> {
    const processed: SupplierRecord[] = []
    const timestamp = new Date().toISOString()

    for (const row of rawData) {
        try {
            // Extraer SKU
            const sku = extractValue(row, mappings.sku)
            if (!sku || sku.trim() === '') continue

            // Extraer precio
            const priceStr = extractValue(row, mappings.price)
            const price = parsePrice(priceStr)
            if (price === null || price < 0) continue

            // Extraer stock
            const stockStr = extractValue(row, mappings.stock)
            const stock = parseStock(stockStr)
            if (stock === null || stock < 0) continue

            // Campos opcionales
            const description = mappings.description ? extractValue(row, mappings.description) : undefined
            const category = mappings.category ? extractValue(row, mappings.category) : undefined

            processed.push({
                sku: sku.trim().toUpperCase(),
                price,
                stock,
                description: description?.trim() || null,
                category: category?.trim() || null,
                supplier_id,
                last_updated: timestamp
            })

        } catch (rowError) {
            console.warn(`Error procesando fila:`, rowError, row)
            continue
        }
    }

    return processed
}

function extractValue(row: any, fieldName: string): string {
    // Buscar el campo por nombre exacto
    if (row[fieldName] !== undefined) {
        return String(row[fieldName]).trim()
    }

    // Buscar por nombre normalizado (sin espacios, sin tildes, minúsculas)
    const normalizedTarget = normalizeFieldName(fieldName)
    
    for (const [key, value] of Object.entries(row)) {
        if (normalizeFieldName(key) === normalizedTarget) {
            return String(value).trim()
        }
    }

    // Buscar por coincidencia parcial
    for (const [key, value] of Object.entries(row)) {
        const normalizedKey = normalizeFieldName(key)
        if (normalizedKey.includes(normalizedTarget) || normalizedTarget.includes(normalizedKey)) {
            return String(value).trim()
        }
    }

    return ''
}

function normalizeFieldName(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remover tildes
        .replace(/[^a-z0-9]/g, '') // Solo letras y números
}

function parsePrice(priceStr: string): number | null {
    if (!priceStr) return null
    
    // Remover símbolos de moneda y espacios
    const cleaned = priceStr
        .replace(/[$€£¥₹₽]/g, '')
        .replace(/[^\d.,]/g, '')
        .trim()
    
    if (!cleaned) return null

    // Manejar diferentes formatos de decimales
    let normalizedPrice = cleaned
    
    // Si tiene punto y coma, asumir formato europeo (123.456,78)
    if (cleaned.includes(',') && cleaned.includes('.')) {
        if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
            // Formato: 123.456,78 -> 123456.78
            normalizedPrice = cleaned.replace(/\./g, '').replace(',', '.')
        } else {
            // Formato: 123,456.78 -> 123456.78
            normalizedPrice = cleaned.replace(/,/g, '')
        }
    } else if (cleaned.includes(',')) {
        // Solo coma - podría ser decimal o separador de miles
        const parts = cleaned.split(',')
        if (parts.length === 2 && parts[1].length <= 2) {
            // Probablemente decimal: 123,45
            normalizedPrice = cleaned.replace(',', '.')
        } else {
            // Probablemente separador de miles: 1,234
            normalizedPrice = cleaned.replace(/,/g, '')
        }
    }

    const parsed = parseFloat(normalizedPrice)
    return isNaN(parsed) ? null : parsed
}

function parseStock(stockStr: string): number | null {
    if (!stockStr) return null
    
    const cleaned = stockStr.replace(/[^\d]/g, '')
    if (!cleaned) return null
    
    const parsed = parseInt(cleaned, 10)
    return isNaN(parsed) ? null : parsed
}

async function insertRecords(records: SupplierRecord[], supplier_id: string) {
    // Insertar en tabla temporal primero para validación
    const { error: insertError } = await supabaseAdmin
        .from('supplier_data_temp')
        .insert(records.map(record => ({
            ...record,
            batch_id: crypto.randomUUID(),
            created_at: new Date().toISOString()
        })))

    if (insertError) {
        console.error('Error insertando en tabla temporal:', insertError)
        throw insertError
    }

    // Procesar datos en la tabla principal (upsert)
    const { error: upsertError } = await supabaseAdmin
        .from('supplier_inventory')
        .upsert(
            records.map(record => ({
                supplier_id: record.supplier_id,
                sku: record.sku,
                price: record.price,
                stock: record.stock,
                description: record.description,
                category: record.category,
                last_updated: record.last_updated,
                updated_at: new Date().toISOString()
            })),
            {
                onConflict: 'supplier_id,sku',
                ignoreDuplicates: false
            }
        )

    if (upsertError) {
        console.error('Error en upsert de datos principales:', upsertError)
        throw upsertError
    }

    // Actualizar estadísticas del proveedor
    await updateSupplierStats(supplier_id, records.length)
}

async function updateSupplierStats(supplier_id: string, recordCount: number) {
    try {
        // Obtener estadísticas actuales
        const { data: currentStats } = await supabaseAdmin
            .from('supplier_stats')
            .select('total_skus, last_sync_records')
            .eq('supplier_id', supplier_id)
            .single()

        const newTotalSkus = (currentStats?.total_skus || 0) + recordCount
        const newSyncRecords = recordCount

        await supabaseAdmin
            .from('supplier_stats')
            .upsert({
                supplier_id,
                total_skus: newTotalSkus,
                last_sync_records: newSyncRecords,
                last_sync_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })

    } catch (error) {
        console.warn('Error actualizando estadísticas del proveedor:', error)
        // No fallar por esto
    }
}