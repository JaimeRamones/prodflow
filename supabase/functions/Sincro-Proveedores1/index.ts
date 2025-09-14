// Ruta: supabase/functions/Sincro-Proveedores1/index.ts
// GRUPO 1: Rodamet + Ventor

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

interface SupplierConfig {
    id: string
    name: string
    source_type: 'dropbox_txt' | 'dropbox_excel'
    source_path: string
    sheet_name?: string
    parsing_logic: 'rodamet_txt' | 'excel_ventor'
    separator: 'tab'
    batch_size: number
    active: boolean
}

const SUPPLIERS: SupplierConfig[] = [
    {
        id: 'rodamet',
        name: 'Rodamet',
        source_type: 'dropbox_txt',
        source_path: '/Rodamet.TXT',
        parsing_logic: 'rodamet_txt',
        separator: 'tab',
        batch_size: 5000,
        active: true
    },
    {
        id: 'ventor',
        name: 'Ventor',
        source_type: 'dropbox_excel',
        source_path: '/Ventor.xlsx',
        sheet_name: 'LISTAS DE PRECIOS CON STOCK',
        parsing_logic: 'excel_ventor',
        separator: 'tab',
        batch_size: 3000,
        active: true
    }
]

async function getDropboxAccessToken() {
    const refreshToken = Deno.env.get('DROPBOX_REFRESH_TOKEN')!
    const appKey = Deno.env.get('DROPBOX_APP_KEY')!
    const appSecret = Deno.env.get('DROPBOX_APP_SECRET')!

    const response = await fetch('https://api.dropbox.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: appKey,
            client_secret: appSecret,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(`No se pudo obtener access token de Dropbox: ${errorBody.error_description}`);
    }

    const data = await response.json();
    return data.access_token;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        console.log('Iniciando Sincro-Proveedores1: Rodamet + Ventor')
        
        const results = []
        const activeSuppliers = SUPPLIERS.filter(s => s.active)

        for (const supplier of activeSuppliers) {
            try {
                const { data: warehouse } = await supabaseAdmin
                    .from('warehouses')
                    .select('id, name')
                    .eq('type', 'proveedor')
                    .ilike('name', supplier.name)
                    .single()

                if (!warehouse) {
                    results.push({
                        supplier_id: supplier.id,
                        status: 'error',
                        message: `Warehouse no encontrado para ${supplier.name}`
                    })
                    continue
                }

                await supabaseAdmin
                    .from('supplier_sync_status')
                    .upsert({
                        supplier_id: supplier.id,
                        supplier_name: supplier.name,
                        status: 'processing',
                        started_at: new Date().toISOString(),
                        total_records: 0,
                        processed_records: 0,
                        error_records: 0,
                        current_batch: 0
                    })

                console.log(`Procesando ${supplier.name}...`)
                await processSupplier(supplier, warehouse)

                results.push({
                    supplier_id: supplier.id,
                    status: 'completed',
                    message: 'Sincronización completada'
                })

            } catch (error) {
                console.error(`Error procesando ${supplier.id}:`, error)
                results.push({
                    supplier_id: supplier.id,
                    status: 'error',
                    message: error.message
                })

                await supabaseAdmin
                    .from('supplier_sync_status')
                    .upsert({
                        supplier_id: supplier.id,
                        status: 'error',
                        message: error.message,
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
            }
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'Grupo 1 completado: Rodamet + Ventor',
            results
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('Error general:', error)
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

async function processSupplier(supplier: SupplierConfig, warehouse: any) {
    // Limpiar stock antiguo
    await supabaseAdmin
        .from('supplier_stock_items')
        .delete()
        .eq('warehouse_id', warehouse.id)

    console.log(`Stock antiguo de ${supplier.name} eliminado`)

    // Obtener datos
    const rawData = await fetchSupplierData(supplier)
    
    if (!rawData || rawData.length === 0) {
        await updateSyncStatus(supplier.id, 'completed', 'No se encontraron datos')
        return
    }

    await updateSyncStatus(supplier.id, 'processing', `Procesando ${rawData.length} líneas...`, rawData.length)

    // Procesar datos
    const processedItems = await processSupplierData(rawData, supplier)
    
    if (processedItems.length === 0) {
        await updateSyncStatus(supplier.id, 'completed', 'No se encontraron items válidos')
        return
    }

    // Eliminar duplicados
    const uniqueItems = new Map()
    for (const item of processedItems) {
        uniqueItems.set(item.sku, item)
    }

    console.log(`${supplier.name}: ${processedItems.length} items, ${uniqueItems.size} únicos`)

    // Procesar en lotes
    const itemsToInsert = Array.from(uniqueItems.values())
    const batches = chunkArray(itemsToInsert, supplier.batch_size)
    let processedCount = 0

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i].map(item => ({
            warehouse_id: warehouse.id,
            sku: item.sku,
            quantity: item.quantity,
            cost_price: item.cost_price,
            last_updated: new Date().toISOString()
        }))

        const { error } = await supabaseAdmin
            .from('supplier_stock_items')
            .insert(batch)

        if (error) {
            console.error(`Error en lote ${i + 1}:`, error)
        } else {
            processedCount += batch.length
            console.log(`Lote ${i + 1}/${batches.length} - ${batch.length} items. Total: ${processedCount}`)
        }
    }

    await updateSyncStatus(supplier.id, 'completed', `Completado: ${processedCount} items`)
}

async function fetchSupplierData(supplier: SupplierConfig): Promise<string[]> {
    const dropboxToken = await getDropboxAccessToken()

    if (supplier.source_type === 'dropbox_txt') {
        return await fetchDropboxTxt(supplier.source_path, dropboxToken)
    } else {
        return await fetchDropboxExcel(supplier.source_path, supplier.sheet_name, dropboxToken, supplier.parsing_logic)
    }
}

async function fetchDropboxTxt(filePath: string, accessToken: string): Promise<string[]> {
    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Dropbox-API-Arg': JSON.stringify({ path: filePath })
        }
    })

    if (!response.ok) {
        throw new Error(`Error descargando TXT: ${response.status}`)
    }

    const text = await response.text()
    return text.split(/\r?\n/).filter(line => line.trim() !== '')
}

async function fetchDropboxExcel(filePath: string, sheetName?: string, accessToken?: string, parsingLogic?: string): Promise<string[]> {
    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Dropbox-API-Arg': JSON.stringify({ path: filePath })
        }
    })

    if (!response.ok) {
        throw new Error(`Error descargando Excel: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    
    const XLSX = await import('https://esm.sh/xlsx@0.18.5')
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    
    const worksheet = sheetName 
        ? workbook.Sheets[sheetName]
        : workbook.Sheets[workbook.SheetNames[0]]
    
    if (!worksheet) {
        throw new Error(`Hoja "${sheetName}" no encontrada`)
    }

    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    
    const lines = []
    for (const row of jsonData) {
        let sku = '', price = '', stock = ''
        
        if (parsingLogic === 'excel_ventor') {
            sku = row['CÓDIGO'] || ''
            price = row['PRECIO'] || ''
            stock = row['STOCK'] || ''
        }
        
        if (sku && price !== '' && stock !== '') {
            lines.push(`${sku}\t${price}\t${stock}`)
        }
    }
    
    return lines
}

async function processSupplierData(lines: string[], supplier: SupplierConfig): Promise<any[]> {
    const items = []

    for (const line of lines) {
        const parts = line.split('\t')
        if (parts.length < 3) continue

        let sku: string, quantity: number, cost_price: number

        if (supplier.parsing_logic === 'rodamet_txt') {
            // Rodamet: SKU STOCK PRECIO
            sku = parts[0].trim()
            const quantityStr = parts[1].replace(/\./g, '')
            const priceStr = parts[2].replace(',', '.')
            
            quantity = parseInt(quantityStr, 10)
            cost_price = parseFloat(priceStr)
        } else {
            // Excel: SKU PRECIO STOCK
            sku = parts[0].trim()
            const priceStr = parts[1].replace(',', '.')
            const quantityStr = parts[2].replace(/\./g, '')
            
            quantity = parseInt(quantityStr, 10)
            cost_price = parseFloat(priceStr)
        }
        
        if (sku && !isNaN(quantity) && !isNaN(cost_price) && cost_price > 0) {
            items.push({ 
                sku, 
                quantity, 
                cost_price: parseFloat(cost_price.toFixed(2)) 
            })
        }
    }

    return items
}

async function updateSyncStatus(
    supplier_id: string,
    status: string,
    message: string,
    total_records = 0,
    processed_records = 0,
    error_records = 0,
    current_batch = 0
) {
    await supabaseAdmin
        .from('supplier_sync_status')
        .upsert({
            supplier_id,
            status,
            message,
            total_records,
            processed_records,
            error_records,
            current_batch,
            updated_at: new Date().toISOString(),
            ...(status === 'completed' || status === 'error' ? { completed_at: new Date().toISOString() } : {})
        })
}

function chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = []
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size))
    }
    return chunks
}