// Ruta: supabase/functions/Sincro-Proveedores/index.ts

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
    source_type: 'dropbox_txt' | 'dropbox_excel' | 'google_sheets' | 'url_csv' | 'url_excel'
    source_path: string
    sheet_name?: string
    parsing_logic: 'rodamet_txt' | 'excel_ventor' | 'excel_rodamitre' | 'excel_cromosol' | 'excel_rodamientos' | 'excel_iden' | 'excel_iturria'
    separator: 'tab' | 'comma' | 'semicolon'
    batch_size: number
    active: boolean
}

// Configuración completa de todos los proveedores
const SUPPLIERS: SupplierConfig[] = [
    {
        id: 'rodamet',
        name: 'Rodamet',
        source_type: 'dropbox_txt',
        source_path: '/Rodamet.TXT',
        parsing_logic: 'rodamet_txt',
        separator: 'tab',
        batch_size: 10000,
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
        batch_size: 5000,
        active: true
    },
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
        active: false // Activar cuando subas el archivo
    },
    {
        id: 'rodamientos_brothers',
        name: 'Rodamientos_Brothers',
        source_type: 'dropbox_excel',
        source_path: '/Rodamientos_Brothers.xlsx',
        sheet_name: 'Hoja1',
        parsing_logic: 'excel_rodamientos',
        separator: 'tab',
        batch_size: 1000,
        active: false // Activar cuando subas el archivo
    },
    {
        id: 'iden',
        name: 'Iden',
        source_type: 'dropbox_excel',
        source_path: '/Iden.xlsx',
        sheet_name: 'Hoja1',
        parsing_logic: 'excel_iden',
        separator: 'tab',
        batch_size: 1000,
        active: false // Activar cuando subas el archivo
    },
    {
        id: 'iturria',
        name: 'Iturria',
        source_type: 'dropbox_excel',
        source_path: '/Iturria.xlsx',
        sheet_name: 'Hoja1',
        parsing_logic: 'excel_iturria',
        separator: 'tab',
        batch_size: 1000,
        active: false // Activar cuando subas el archivo
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
        const { action, supplier_id, force_sync } = await req.json()

        switch (action) {
            case 'start_sync':
                return await startSyncProcess(supplier_id, force_sync)
            case 'get_status':
                return await getSyncStatus(supplier_id)
            case 'get_suppliers':
                return await getSupplierConfigs()
            default:
                throw new Error('Acción no válida')
        }

    } catch (error) {
        console.error('Error en coordinador:', error)
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})

async function startSyncProcess(supplier_id?: string, force_sync = false) {
    const suppliers = supplier_id 
        ? SUPPLIERS.filter(s => s.id === supplier_id && s.active)
        : SUPPLIERS.filter(s => s.active)

    if (suppliers.length === 0) {
        throw new Error('No se encontraron proveedores activos')
    }

    const results = []

    for (const supplier of suppliers) {
        try {
            // Verificar warehouse existe
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

            // Verificar si ya hay sincronización en progreso
            if (!force_sync) {
                const { data: existingSync } = await supabaseAdmin
                    .from('supplier_sync_status')
                    .select('status')
                    .eq('supplier_id', supplier.id)
                    .eq('status', 'processing')
                    .single()

                if (existingSync) {
                    results.push({
                        supplier_id: supplier.id,
                        status: 'skipped',
                        message: 'Sincronización ya en progreso'
                    })
                    continue
                }
            }

            // Crear registro de estado inicial
            await supabaseAdmin
                .from('supplier_sync_status')
                .upsert({
                    supplier_id: supplier.id,
                    supplier_name: supplier.name,
                    status: 'queued',
                    started_at: new Date().toISOString(),
                    total_records: 0,
                    processed_records: 0,
                    error_records: 0,
                    current_batch: 0
                })

            console.log(`Iniciando procesamiento secuencial de ${supplier.name}...`)

            // CAMBIO CLAVE: Procesamiento secuencial con await
            await processSupplierAsync(supplier, warehouse)

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
        }
    }

    // Respuesta al final, después de procesar todos los proveedores
    return new Response(JSON.stringify({
        success: true,
        message: `Procesamiento secuencial completado para ${results.length} proveedores`,
        results
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

async function processSupplierAsync(supplier: SupplierConfig, warehouse: any) {
    try {
        await updateSyncStatus(supplier.id, 'processing', 'Iniciando descarga de datos...')

        // Limpiar stock antiguo
        await supabaseAdmin
            .from('supplier_stock_items')
            .delete()
            .eq('warehouse_id', warehouse.id)

        console.log(`Stock antiguo de ${supplier.name} eliminado. Procesando archivo...`)

        // Obtener datos según el tipo de fuente
        const rawData = await fetchSupplierData(supplier)
        
        if (!rawData || rawData.length === 0) {
            await updateSyncStatus(supplier.id, 'completed', 'No se encontraron datos para procesar')
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

        console.log(`Total items: ${processedItems.length}. Items únicos: ${uniqueItems.size}`)

        // Procesar en lotes
        const itemsToInsert = Array.from(uniqueItems.values())
        const batches = chunkArray(itemsToInsert, supplier.batch_size)
        let processedCount = 0

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i].map(item => ({
                warehouse_id: warehouse.id,
                sku: item.sku, // SKU EXACTO sin modificaciones
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
                console.log(`Lote de ${batch.length} items guardado para ${supplier.name}. Total: ${processedCount}`)
            }

            await updateSyncStatus(
                supplier.id, 
                'processing', 
                `Procesado lote ${i + 1}/${batches.length}`,
                rawData.length,
                processedCount,
                0,
                i + 1
            )
        }

        await updateSyncStatus(supplier.id, 'completed', `Completado: ${processedCount} items procesados`)

    } catch (error) {
        console.error(`Error procesando proveedor ${supplier.id}:`, error)
        await updateSyncStatus(supplier.id, 'error', error.message)
    }
}

async function fetchSupplierData(supplier: SupplierConfig): Promise<string[]> {
    const dropboxToken = await getDropboxAccessToken()

    switch (supplier.source_type) {
        case 'dropbox_txt':
            return await fetchDropboxTxt(supplier.source_path, dropboxToken)
        case 'dropbox_excel':
            return await fetchDropboxExcel(supplier.source_path, supplier.sheet_name, dropboxToken, supplier.parsing_logic)
        default:
            throw new Error(`Tipo de fuente no soportado: ${supplier.source_type}`)
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
        throw new Error(`Error descargando archivo TXT de Dropbox: ${response.status}`)
    }

    const text = await response.text()
    return text.split(/\r?\n/).filter(line => line.trim() !== '')
}

async function fetchDropboxExcel(filePath: string, sheetName?: string, accessToken?: string, parsingLogic?: string): Promise<string[]> {
    if (!accessToken) accessToken = await getDropboxAccessToken()

    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Dropbox-API-Arg': JSON.stringify({ path: filePath })
        }
    })

    if (!response.ok) {
        throw new Error(`Error descargando Excel de Dropbox: ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    
    // Usar SheetJS para procesar Excel
    const XLSX = await import('https://esm.sh/xlsx@0.18.5')
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    
    console.log('Hojas disponibles:', workbook.SheetNames)
    
    const worksheet = sheetName 
        ? workbook.Sheets[sheetName]
        : workbook.Sheets[workbook.SheetNames[0]]
    
    if (!worksheet) {
        console.error(`Hoja "${sheetName}" no encontrada. Hojas disponibles:`, workbook.SheetNames)
        throw new Error(`Hoja "${sheetName}" no encontrada`)
    }

    // Convertir a JSON manteniendo los headers originales
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    
    console.log('Headers detectados:', Object.keys(jsonData[0] || {}))
    console.log('Primeras 2 filas:', jsonData.slice(0, 2))
    
    const lines = []
    for (const row of jsonData) {
        let sku = '', price = '', stock = ''
        
        // Mapeo específico por proveedor usando parsing_logic
        switch (parsingLogic) {
            case 'excel_ventor':
                // Ventor: "CÓDIGO" | "PRECIO" | "STOCK"
                sku = row['CÓDIGO'] || ''
                price = row['PRECIO'] || ''
                stock = row['STOCK'] || ''
                break
                
            case 'excel_rodamitre':
                // Rodamitre: "Cod. Art. P." | "Neto + IVA" | "Stock 1"
                sku = row['Cod. Art. P.'] || ''
                price = row['Neto + IVA'] || ''
                stock = row['Stock 1'] || ''
                break
                
            case 'excel_cromosol':
                // Cromosol: "codigo" | "precio neto" | "cantidad"
                sku = row['codigo'] || ''
                price = row['precio neto'] || ''
                stock = row['cantidad'] || ''
                break
                
            case 'excel_rodamientos':
                // Rodamientos_Brothers: "codigo" | "precio" | "cantidad"
                sku = row['codigo'] || ''
                price = row['precio'] || ''
                stock = row['cantidad'] || ''
                break
                
            case 'excel_iden':
                // Iden: "codigo" | "precio" | "cantidad"
                sku = row['codigo'] || ''
                price = row['precio'] || ''
                stock = row['cantidad'] || ''
                break
                
            case 'excel_iturria':
                // Iturria: "codigo" | "precio" | "cantidad"
                sku = row['codigo'] || ''
                price = row['precio'] || ''
                stock = row['cantidad'] || ''
                break
                
            default:
                console.warn(`Parsing logic no reconocido: ${parsingLogic}`)
                continue
        }
        
        // Validación corregida para incluir stock 0
        if (sku && price !== '' && stock !== '') {
            lines.push(`${sku}\t${price}\t${stock}`)
        }
    }
    
    console.log(`Archivo ${filePath}: ${jsonData.length} filas totales, ${lines.length} filas válidas`)
    return lines
}

async function processSupplierData(lines: string[], supplier: SupplierConfig): Promise<any[]> {
    const items = []

    for (const line of lines) {
        const parts = line.split('\t')
        if (parts.length < 3) continue

        let sku: string, quantity: number, cost_price: number

        if (supplier.parsing_logic === 'rodamet_txt') {
            // Rodamet TXT: SKU STOCK PRECIO (orden especial)
            sku = parts[0].trim()
            const quantityStr = parts[1].replace(/\./g, '')
            const priceStr = parts[2].replace(',', '.')
            
            quantity = parseInt(quantityStr, 10)
            cost_price = parseFloat(priceStr)
        } else {
            // Todos los Excel: SKU PRECIO STOCK (orden estándar después del procesamiento)
            sku = parts[0].trim()
            const priceStr = parts[1].replace(',', '.')
            const quantityStr = parts[2].replace(/\./g, '')
            
            quantity = parseInt(quantityStr, 10)
            cost_price = parseFloat(priceStr)
        }
        
        // Validaciones
        if (sku && !isNaN(quantity) && !isNaN(cost_price) && cost_price > 0) {
            items.push({ 
                sku, // SKU exacto sin modificaciones
                quantity, 
                cost_price: parseFloat(cost_price.toFixed(2)) 
            })
        }
    }

    return items
}

async function getSyncStatus(supplier_id?: string) {
    let query = supabaseAdmin
        .from('supplier_sync_status')
        .select('*')
        .order('started_at', { ascending: false })

    if (supplier_id) {
        query = query.eq('supplier_id', supplier_id).limit(1)
    } else {
        query = query.limit(10)
    }

    const { data, error } = await query
    if (error) throw error

    return new Response(JSON.stringify({
        success: true,
        data: supplier_id ? data[0] : data
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
}

async function getSupplierConfigs() {
    const allSuppliers = [
        ...SUPPLIERS_GROUP_1,
        ...SUPPLIERS_GROUP_2, 
        ...SUPPLIERS_GROUP_3,
        ...SUPPLIERS_GROUP_4
    ]

    return new Response(JSON.stringify({
        success: true,
        suppliers: allSuppliers.map(s => ({
            id: s.id,
            name: s.name,
            source_type: s.source_type,
            active: s.active,
            batch_size: s.batch_size,
            parsing_logic: s.parsing_logic
        })),
        available_actions: [
            'sync_group_1: Rodamet + Ventor',
            'sync_group_2: Rodamitre + Cromosol', 
            'sync_group_3: Rodamientos + Iden',
            'sync_group_4: Iturria',
            'sync_all_groups: Todos los grupos secuencialmente'
        ]
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
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