import React, { useState, useContext, useRef } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

const ComboImportExportModal = ({ show, onClose }) => {
    const { showMessage, session } = useContext(AppContext);
    const [activeTab, setActiveTab] = useState('export'); // 'export' | 'import'
    const [isProcessing, setIsProcessing] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const [exportFormat, setExportFormat] = useState('complete'); // 'complete' | 'template'
    const [importErrors, setImportErrors] = useState([]);
    const fileInputRef = useRef(null);

    const handleExport = async () => {
        setIsProcessing(true);
        try {
            if (exportFormat === 'complete') {
                // Exportar combos existentes con todos sus datos
                const { data: combos, error } = await supabase
                    .from('garaje_combos_complete')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .order('combo_name');

                if (error) throw error;

                // Obtener componentes de todos los combos
                const { data: components, error: componentsError } = await supabase
                    .from('garaje_combo_items')
                    .select('*')
                    .in('combo_id', combos.map(c => c.id))
                    .order('combo_id, position');

                if (componentsError) throw componentsError;

                // Crear estructura para Excel
                const excelData = [];
                
                combos.forEach(combo => {
                    const comboComponents = components.filter(c => c.combo_id === combo.id);
                    
                    comboComponents.forEach((component, index) => {
                        excelData.push({
                            'Combo SKU': index === 0 ? combo.combo_sku : '', // Solo en la primera fila
                            'Combo Name': index === 0 ? combo.combo_name : '',
                            'Category': index === 0 ? combo.category || '' : '',
                            'Subcategory': index === 0 ? combo.subcategory || '' : '',
                            'Description': index === 0 ? combo.description || '' : '',
                            'Markup %': index === 0 ? combo.markup_percentage || 0 : '',
                            'Fixed Price': index === 0 ? combo.fixed_price || '' : '',
                            'Locations': index === 0 ? (combo.locations || []).join(', ') : '',
                            'Is Active': index === 0 ? (combo.is_active ? 'SI' : 'NO') : '',
                            'Component SKU': component.product_sku,
                            'Component Name': component.product_name,
                            'Quantity': component.quantity,
                            'Cost Price': component.cost_price,
                            'Sale Price': component.sale_price,
                            'Supplier Name': component.supplier_name,
                            'Stock Available': combo.available_stock || 0,
                            'Final Price': combo.final_price || 0,
                            'Margin %': combo.margin_percentage || 0,
                            'Created At': combo.created_at ? new Date(combo.created_at).toLocaleDateString() : '',
                            'Updated At': combo.updated_at ? new Date(combo.updated_at).toLocaleDateString() : ''
                        });
                    });
                    
                    // Agregar fila vacía entre combos para mejor legibilidad
                    if (comboComponents.length > 0) {
                        excelData.push({});
                    }
                });

                const worksheet = XLSX.utils.json_to_sheet(excelData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Combos Export');

                // Configurar ancho de columnas
                const colWidths = [
                    { wch: 25 }, // Combo SKU
                    { wch: 30 }, // Combo Name
                    { wch: 15 }, // Category
                    { wch: 15 }, // Subcategory
                    { wch: 40 }, // Description
                    { wch: 10 }, // Markup %
                    { wch: 12 }, // Fixed Price
                    { wch: 20 }, // Locations
                    { wch: 10 }, // Is Active
                    { wch: 20 }, // Component SKU
                    { wch: 30 }, // Component Name
                    { wch: 10 }, // Quantity
                    { wch: 12 }, // Cost Price
                    { wch: 12 }, // Sale Price
                    { wch: 20 }, // Supplier Name
                    { wch: 12 }, // Stock Available
                    { wch: 12 }, // Final Price
                    { wch: 10 }, // Margin %
                    { wch: 12 }, // Created At
                    { wch: 12 }  // Updated At
                ];
                worksheet['!cols'] = colWidths;

                const fileName = `combos_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
                XLSX.writeFile(workbook, fileName);
                
                showMessage(`Exportados ${combos.length} combos con éxito en ${fileName}`, 'success');

            } else {
                // Exportar plantilla vacía para importación
                const templateData = [
                    {
                        'Combo SKU': 'EJEMPLO_KIT_01',
                        'Combo Name': 'Kit de Ejemplo',
                        'Category': 'Filtros',
                        'Subcategory': 'Aceite y Aire',
                        'Description': 'Kit completo de filtros para mantenimiento',
                        'Markup %': 10,
                        'Fixed Price': '',
                        'Locations': 'Delantero, Izquierdo',
                        'Is Active': 'SI',
                        'Component SKU': 'FILTRO_001',
                        'Component Name': 'Filtro de Aceite',
                        'Quantity': 1,
                        'Cost Price': 1500,
                        'Sale Price': 2000,
                        'Supplier Name': 'Proveedor Ejemplo'
                    },
                    {
                        'Combo SKU': '', // Vacío para el segundo componente
                        'Combo Name': '',
                        'Category': '',
                        'Subcategory': '',
                        'Description': '',
                        'Markup %': '',
                        'Fixed Price': '',
                        'Locations': '',
                        'Is Active': '',
                        'Component SKU': 'FILTRO_002',
                        'Component Name': 'Filtro de Aire',
                        'Quantity': 1,
                        'Cost Price': 800,
                        'Sale Price': 1200,
                        'Supplier Name': 'Proveedor Ejemplo'
                    }
                ];

                const worksheet = XLSX.utils.json_to_sheet(templateData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Combos');

                // Agregar comentarios/instrucciones
                const instructions = [
                    ['INSTRUCCIONES PARA IMPORTAR COMBOS'],
                    [''],
                    ['1. Llena los datos del combo solo en la PRIMERA fila de cada combo'],
                    ['2. Los componentes adicionales van en las filas siguientes con datos del combo vacíos'],
                    ['3. Is Active: SI o NO'],
                    ['4. Locations: separados por comas (Delantero, Trasero, etc.)'],
                    ['5. Component SKU debe existir en tu inventario o proveedores'],
                    ['6. Guarda el archivo y selecciónalo en la pestaña Importar'],
                    [''],
                    ['Ejemplo: Un combo con 2 componentes ocupa 2 filas'],
                    ['Fila 1: Datos completos del combo + primer componente'],
                    ['Fila 2: Solo datos del segundo componente'],
                ];

                const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
                XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instrucciones');

                XLSX.writeFile(workbook, 'plantilla_combos.xlsx');
                showMessage('Plantilla de importación descargada con éxito', 'success');
            }

        } catch (error) {
            showMessage(`Error al exportar: ${error.message}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = async (file) => {
        setIsProcessing(true);
        setImportErrors([]);
        setImportProgress({ current: 0, total: 0 });

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                throw new Error('El archivo está vacío o no tiene el formato correcto');
            }

            setImportProgress({ current: 0, total: jsonData.length });

            // Agrupar filas por combo
            const combosToImport = [];
            let currentCombo = null;

            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                
                // Si hay un Combo SKU, es el inicio de un nuevo combo
                if (row['Combo SKU'] && row['Combo SKU'].trim()) {
                    if (currentCombo) {
                        combosToImport.push(currentCombo);
                    }
                    
                    currentCombo = {
                        combo_sku: row['Combo SKU'].trim(),
                        combo_name: row['Combo Name'] || '',
                        category: row['Category'] || '',
                        subcategory: row['Subcategory'] || '',
                        description: row['Description'] || '',
                        markup_percentage: parseFloat(row['Markup %']) || 0,
                        fixed_price: row['Fixed Price'] ? parseFloat(row['Fixed Price']) : null,
                        locations: row['Locations'] ? row['Locations'].split(',').map(l => l.trim()).filter(Boolean) : [],
                        is_active: (row['Is Active'] || '').toUpperCase() === 'SI',
                        components: []
                    };
                }

                // Agregar componente si existe SKU de componente
                if (row['Component SKU'] && row['Component SKU'].trim() && currentCombo) {
                    currentCombo.components.push({
                        product_sku: row['Component SKU'].trim(),
                        product_name: row['Component Name'] || '',
                        quantity: parseInt(row['Quantity']) || 1,
                        cost_price: parseFloat(row['Cost Price']) || 0,
                        sale_price: parseFloat(row['Sale Price']) || 0,
                        supplier_name: row['Supplier Name'] || ''
                    });
                }
            }

            // Agregar el último combo
            if (currentCombo) {
                combosToImport.push(currentCombo);
            }

            console.log('Combos a importar:', combosToImport);

            // Procesar cada combo
            const errors = [];
            let successCount = 0;

            for (let i = 0; i < combosToImport.length; i++) {
                const combo = combosToImport[i];
                setImportProgress({ current: i + 1, total: combosToImport.length });

                try {
                    // Validaciones básicas
                    if (!combo.combo_sku || !combo.combo_name) {
                        errors.push(`Fila ${i + 1}: SKU y nombre del combo son obligatorios`);
                        continue;
                    }

                    if (combo.components.length === 0) {
                        errors.push(`Combo ${combo.combo_sku}: debe tener al menos un componente`);
                        continue;
                    }

                    // Verificar que el SKU no exista
                    const { data: existingCombo } = await supabase
                        .from('garaje_combos')
                        .select('id')
                        .eq('combo_sku', combo.combo_sku)
                        .eq('user_id', session.user.id)
                        .single();

                    if (existingCombo) {
                        errors.push(`Combo ${combo.combo_sku}: ya existe`);
                        continue;
                    }

                    // Obtener brands de los componentes (si están disponibles)
                    const brands = [];
                    
                    // Crear el combo
                    const comboData = {
                        ...combo,
                        user_id: session.user.id,
                        brands
                    };

                    const { data: savedCombo, error: comboError } = await supabase
                        .from('garaje_combos')
                        .insert(comboData)
                        .select()
                        .single();

                    if (comboError) throw comboError;

                    // Agregar componentes
                    const componentData = combo.components.map((comp, index) => ({
                        combo_id: savedCombo.id,
                        product_sku: comp.product_sku,
                        quantity: comp.quantity,
                        product_name: comp.product_name,
                        cost_price: comp.cost_price,
                        sale_price: comp.sale_price,
                        supplier_name: comp.supplier_name,
                        position: index
                    }));

                    const { error: componentsError } = await supabase
                        .from('garaje_combo_items')
                        .insert(componentData);

                    if (componentsError) throw componentsError;

                    successCount++;

                } catch (error) {
                    errors.push(`Combo ${combo.combo_sku}: ${error.message}`);
                }
            }

            setImportErrors(errors);

            if (successCount > 0) {
                showMessage(`Importación completada: ${successCount} combos creados${errors.length > 0 ? `, ${errors.length} errores` : ''}`, 'success');
            } else {
                showMessage('No se pudo importar ningún combo. Revisa los errores.', 'error');
            }

        } catch (error) {
            showMessage(`Error al procesar archivo: ${error.message}`, 'error');
        } finally {
            setIsProcessing(false);
            setImportProgress({ current: 0, total: 0 });
        }
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                showMessage('Por favor selecciona un archivo Excel (.xlsx o .xls)', 'error');
                return;
            }
            handleImport(file);
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 className="text-xl font-semibold text-white">Import / Export de Combos</h3>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-700">
                    <button
                        onClick={() => setActiveTab('export')}
                        className={`flex-1 px-6 py-3 text-center font-medium transition-colors ${
                            activeTab === 'export' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                    >
                        <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Exportar
                    </button>
                    <button
                        onClick={() => setActiveTab('import')}
                        className={`flex-1 px-6 py-3 text-center font-medium transition-colors ${
                            activeTab === 'import' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                    >
                        <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12l2 2 4-4"></path>
                        </svg>
                        Importar
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'export' ? (
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-lg font-semibold text-white mb-4">Exportar Combos a Excel</h4>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Tipo de Exportación
                                        </label>
                                        <div className="space-y-3">
                                            <label className="flex items-center">
                                                <input
                                                    type="radio"
                                                    name="exportFormat"
                                                    value="complete"
                                                    checked={exportFormat === 'complete'}
                                                    onChange={(e) => setExportFormat(e.target.value)}
                                                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600"
                                                />
                                                <span className="ml-2 text-white">
                                                    <strong>Exportación Completa</strong> - Todos los combos existentes con sus datos
                                                </span>
                                            </label>
                                            <label className="flex items-center">
                                                <input
                                                    type="radio"
                                                    name="exportFormat"
                                                    value="template"
                                                    checked={exportFormat === 'template'}
                                                    onChange={(e) => setExportFormat(e.target.value)}
                                                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600"
                                                />
                                                <span className="ml-2 text-white">
                                                    <strong>Plantilla de Importación</strong> - Archivo vacío con formato de ejemplo
                                                </span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="bg-gray-900 p-4 rounded-lg">
                                        <h5 className="text-md font-semibold text-white mb-2">Información del Export</h5>
                                        <ul className="text-sm text-gray-300 space-y-1">
                                            <li>• El archivo incluirá todos los datos del combo y sus componentes</li>
                                            <li>• Formato Excel (.xlsx) compatible con Excel, Google Sheets, LibreOffice</li>
                                            <li>• Cada combo puede ocupar múltiples filas según sus componentes</li>
                                            <li>• Incluye precios, stocks, márgenes calculados</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-lg font-semibold text-white mb-4">Importar Combos desde Excel</h4>
                                
                                <div className="space-y-4">
                                    <div className="bg-yellow-600/20 border border-yellow-600/50 rounded-lg p-4">
                                        <h5 className="text-yellow-300 font-semibold mb-2">Instrucciones Importantes</h5>
                                        <ul className="text-sm text-yellow-100 space-y-1">
                                            <li>1. Descarga primero la plantilla usando la pestaña "Exportar"</li>
                                            <li>2. Los datos del combo van solo en la primera fila de cada combo</li>
                                            <li>3. Los componentes adicionales van en filas siguientes</li>
                                            <li>4. Los SKUs de componentes deben existir en tu inventario o proveedores</li>
                                            <li>5. El formato debe ser Excel (.xlsx o .xls)</li>
                                        </ul>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Seleccionar Archivo Excel
                                        </label>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".xlsx,.xls"
                                            onChange={handleFileSelect}
                                            className="hidden"
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={isProcessing}
                                            className="w-full p-4 border-2 border-dashed border-gray-600 rounded-lg text-center hover:border-blue-500 transition-colors disabled:opacity-50"
                                        >
                                            <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                            </svg>
                                            <span className="text-white">
                                                {isProcessing ? 'Procesando...' : 'Haz clic para seleccionar archivo Excel'}
                                            </span>
                                        </button>
                                    </div>

                                    {/* Progress */}
                                    {isProcessing && importProgress.total > 0 && (
                                        <div className="bg-gray-900 p-4 rounded-lg">
                                            <div className="flex justify-between text-sm text-gray-300 mb-2">
                                                <span>Procesando combos</span>
                                                <span>{importProgress.current} / {importProgress.total}</span>
                                            </div>
                                            <div className="w-full bg-gray-700 rounded-full h-2">
                                                <div 
                                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Errors */}
                                    {importErrors.length > 0 && (
                                        <div className="bg-red-600/20 border border-red-600/50 rounded-lg p-4">
                                            <h5 className="text-red-300 font-semibold mb-2">Errores en la Importación</h5>
                                            <div className="max-h-32 overflow-y-auto">
                                                <ul className="text-sm text-red-100 space-y-1">
                                                    {importErrors.map((error, index) => (
                                                        <li key={index}>• {error}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 border-t border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                    >
                        Cerrar
                    </button>
                    
                    {activeTab === 'export' && (
                        <button
                            onClick={handleExport}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                        >
                            {isProcessing ? 'Exportando...' : 'Descargar Excel'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ComboImportExportModal;