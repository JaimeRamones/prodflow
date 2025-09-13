// Ruta: supabase/functions/Sincro-Proveedores2/index.ts  
// GRUPO 2: Rodamitre + Cromosol - VERSIÓN COMPLETA CORREGIDA

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
    source_type: 'dropbox_excel'
    source_path: string
    sheet_name?: string
    parsing_logic: 'excel_rodamitre' | 'excel_cromosol'
    separator: 'tab'
    batch_size: number
    active: boolean
}

const SUPPLIERS: SupplierConfig[] = [
    {
        id: 'rodamitre',
        name: 'Rodamitre',
        source_type: 'dropbox_excel',
        source_path: '/Rodamitre.xlsx',
        sheet_name: 'Listado de Artículos 05-04-2022',
        parsing_logic: 'excel_rodamitre',
        separator: 'tab',
        batch_size: 3000,
        active: true
    },
    {
        id: 'cromosol',
        name: 'Cromosol',
        source_type: 'dropbox_excel',
        source_path: '/Cromosol.xlsx',
        sheet_name: 'Hoja1',
        parsing_logic: 'excel_cromosol',
        separator: 'tab',
        batch_size: 1000,
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
        console.log('Iniciando Sincro-Proveedores2: Rodamitre + Cromosol')
        
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
            message: 'Grupo 2 completado: Rodamitre + Cromosol',
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

    // Obtener datos con procesamiento mejorado
    const rawData = await fetchDropboxExcelOptimized(supplier.source_path, supplier.sheet_name, null, supplier.parsing_logic)
    
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

    console.log(`${supplier.name}: ${processedItems.length} items procesados, ${uniqueItems.size} únicos`)

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

// FUNCIÓN OPTIMIZADA CON VALIDACIÓN MEJORADA
async function fetchDropboxExcelOptimized(filePath: string, sheetName?: string, accessToken?: string, parsingLogic?: string): Promise<string[]> {
    if (!accessToken) accessToken = await getDropboxAccessToken()

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
    
    console.log('Hojas disponibles:', workbook.SheetNames)
    
    const worksheet = sheetName 
        ? workbook.Sheets[sheetName]
        : workbook.Sheets[workbook.SheetNames[0]]
    
    if (!worksheet) {
        throw new Error(`Hoja "${sheetName}" no encontrada. Hojas: ${workbook.SheetNames.join(', ')}`)
    }

    // Convertir TODO el archivo de una vez
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    
    console.log(`Total filas en el archivo: ${jsonData.length}`)
    
    // Mostrar headers para debugging
    if (jsonData.length > 0) {
        const headers = Object.keys(jsonData[0])
        console.log('HEADERS REALES ENCONTRADOS:', headers)
    }
    
    const lines = []
    let validCount = 0
    let skippedCount = 0
    
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i]
        let sku = '', price = '', stock = ''
        
        if (parsingLogic === 'excel_rodamitre') {
            // Obtener valores exactos según los headers del Excel
            sku = String(row['Cod. Art. P.'] || '').trim()
            price = String(row['Neto + IVA'] || '').trim()
            stock = String(row['Stock 1'] || '').trim()
        } else if (parsingLogic === 'excel_cromosol') {
            sku = String(row['codigo'] || '').trim()
            price = String(row['precio neto'] || '').trim()
            stock = String(row['cantidad'] || '').trim()
        }
        
        // VALIDACIÓN MEJORADA: Procesar todos los casos válidos
        if (sku && sku !== '' && sku !== 'undefined' && sku !== 'null') {
            // Verificar que el precio sea válido
            if (!price || price === '' || price === 'undefined' || price === 'null') {
                skippedCount++
                continue
            }
            
            // Verificar que el precio sea un número válido
            const priceNum = parseFloat(price)
            if (isNaN(priceNum) || priceNum <= 0) {
                skippedCount++
                continue
            }
            
            // Si stock está vacío, null o undefined, usar 0
            let finalStock = stock
            if (!stock || stock === '' || stock === 'undefined' || stock === 'null') {
                finalStock = '0'
            } else {
                // Verificar que stock sea un número válido
                const stockNum = parseInt(stock)
                if (isNaN(stockNum)) {
                    finalStock = '0'
                } else {
                    finalStock = stockNum.toString()
                }
            }
            
            // Limpiar el precio para que tenga exactamente 2 decimales
            const cleanPrice = priceNum.toFixed(2)
            
            lines.push(`${sku}\t${cleanPrice}\t${finalStock}`)
            validCount++
        } else {
            skippedCount++
        }
    }
    
    console.log(`RESULTADO FINAL:`)
    console.log(`- Total filas procesadas: ${jsonData.length}`)
    console.log(`- Filas válidas: ${validCount}`)
    console.log(`- Filas saltadas: ${skippedCount}`)
    console.log(`- Porcentaje válido: ${((validCount / jsonData.length) * 100).toFixed(1)}%`)
    
    return lines
}

async function processSupplierData(lines: string[], supplier: SupplierConfig): Promise<any[]> {
    const items = []

    for (const line of lines) {
        const parts = line.split('\t')
        if (parts.length < 3) continue

        const sku = parts[0].trim()
        const priceStr = parts[1] // Ya viene limpio con 2 decimales
        const quantityStr = parts[2]
        
        const quantity = parseInt(quantityStr, 10)
        const cost_price = parseFloat(priceStr)
        
        // Validación final
        if (sku && !isNaN(quantity) && quantity >= 0 && 
            !isNaN(cost_price) && cost_price > 0) {
            items.push({ 
                sku, 
                quantity, 
                cost_price // Ya tiene exactamente 2 decimales
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