// Ruta: src/components/ExcelImportExport.js
// Sistema completo de importación y exportación de inventario via Excel

import React, { useState, useContext, useRef } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import { masterData } from '../masterData';

const ExcelImportExport = () => {
    const { products, suppliers, showMessage, fetchProducts } = useContext(AppContext);
    const [isImporting, setIsImporting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [previewData, setPreviewData] = useState([]);
    const [showPreview, setShowPreview] = useState(false);
    const [importStats, setImportStats] = useState(null);
    const fileInputRef = useRef(null);

    // Función para leer archivo Excel
    const readExcelFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = window.XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    // Función para exportar a Excel
    const handleExport = async () => {
        setIsExporting(true);
        try {
            // Preparar datos para exportación
            const exportData = [
                // Headers
                ['SKU', 'Nombre', 'Marca', 'Proveedor_ID', 'Rubro', 'Subrubro', 'Stock_Total', 'Costo', 'Precio_Venta'],
                // Datos de productos
                ...products.map(product => [
                    product.sku || '',
                    product.name || '',
                    product.brand || '',
                    product.supplier_id || '',
                    product.rubro || '',
                    product.subrubro || '',
                    product.stock_total || 0,
                    product.cost_price || 0,
                    product.sale_price || 0
                ])
            ];

            // Crear workbook
            const wb = window.XLSX.utils.book_new();
            const ws = window.XLSX.utils.aoa_to_sheet(exportData);
            
            // Configurar anchos de columnas
            ws['!cols'] = [
                { wch: 15 }, // SKU
                { wch: 30 }, // Nombre
                { wch: 15 }, // Marca
                { wch: 12 }, // Proveedor_ID
                { wch: 15 }, // Rubro
                { wch: 20 }, // Subrubro
                { wch: 12 }, // Stock_Total
                { wch: 12 }, // Costo
                { wch: 12 }, // Precio_Venta
            ];

            window.XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
            
            // Descargar archivo
            const fileName = `Inventario_${new Date().toISOString().split('T')[0]}.xlsx`;
            window.XLSX.writeFile(wb, fileName);
            
            showMessage(`Inventario exportado exitosamente: ${fileName}`, 'success');
        } catch (error) {
            showMessage(`Error al exportar: ${error.message}`, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    // Función para crear plantilla de Excel
    const handleExportTemplate = () => {
        try {
            const templateData = [
                // Headers con descripciones
                ['SKU', 'Nombre', 'Marca', 'Proveedor_ID', 'Rubro', 'Subrubro', 'Stock_Total', 'Costo', 'Precio_Venta'],
                ['Obligatorio', 'Obligatorio', 'Opcional', 'ID del proveedor', 'Opcional', 'Opcional', 'Número entero', 'Precio decimal', 'Se calcula automático'],
                // Ejemplos
                ['AIMET M 68', 'Bomba De Aceite Chevrolet Zafira 2.0 16v', 'AIMET', '1', 'Autopartes', 'Motor', '10', '76270.66', ''],
                ['R 636193 NBC', 'Kit 2 Ruleman Rueda Delantera Hyundai Atos', 'R', '2', 'Autopartes', 'Suspensión', '5', '32500.00', ''],
            ];

            // Crear hoja de proveedores disponibles
            const suppliersData = [
                ['ID_Proveedor', 'Nombre_Proveedor'],
                ...suppliers.map(supplier => [supplier.id, supplier.name])
            ];

            // Crear hoja de marcas disponibles
            const brandsData = [
                ['Marcas_Disponibles'],
                ...masterData.brands.map(brand => [brand])
            ];

            // Crear hoja de rubros disponibles
            const rubrosData = [
                ['Rubro', 'Subrubros'],
                ...Object.entries(masterData.categories).flatMap(([rubro, subrubros]) => 
                    subrubros.map((subrubro, index) => 
                        index === 0 ? [rubro, subrubro] : ['', subrubro]
                    )
                )
            ];

            const wb = window.XLSX.utils.book_new();
            
            // Hoja principal
            const ws1 = window.XLSX.utils.aoa_to_sheet(templateData);
            ws1['!cols'] = [
                { wch: 15 }, { wch: 40 }, { wch: 15 }, { wch: 12 }, 
                { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
            ];
            window.XLSX.utils.book_append_sheet(wb, ws1, 'Plantilla_Productos');

            // Hoja de proveedores
            const ws2 = window.XLSX.utils.aoa_to_sheet(suppliersData);
            ws2['!cols'] = [{ wch: 15 }, { wch: 30 }];
            window.XLSX.utils.book_append_sheet(wb, ws2, 'Proveedores');

            // Hoja de marcas
            const ws3 = window.XLSX.utils.aoa_to_sheet(brandsData);
            ws3['!cols'] = [{ wch: 20 }];
            window.XLSX.utils.book_append_sheet(wb, ws3, 'Marcas');

            // Hoja de rubros
            const ws4 = window.XLSX.utils.aoa_to_sheet(rubrosData);
            ws4['!cols'] = [{ wch: 20 }, { wch: 25 }];
            window.XLSX.utils.book_append_sheet(wb, ws4, 'Rubros_y_Subrubros');

            window.XLSX.writeFile(wb, 'Plantilla_Importacion_Inventario.xlsx');
            showMessage('Plantilla descargada exitosamente. Completa los datos y súbela para importar.', 'success');
        } catch (error) {
            showMessage(`Error al crear plantilla: ${error.message}`, 'error');
        }
    };

    // Función para validar datos
    const validateRowData = (row, index) => {
        const errors = [];
        const [sku, name, brand, supplierId, rubro, subrubro, stockTotal, costPrice] = row;

        if (!sku || sku.toString().trim() === '') {
            errors.push(`Fila ${index + 1}: SKU es obligatorio`);
        }

        if (!name || name.toString().trim() === '') {
            errors.push(`Fila ${index + 1}: Nombre es obligatorio`);
        }

        if (supplierId && !suppliers.find(s => s.id.toString() === supplierId.toString())) {
            errors.push(`Fila ${index + 1}: Proveedor ID ${supplierId} no existe`);
        }

        if (brand && !masterData.brands.includes(brand)) {
            errors.push(`Fila ${index + 1}: Marca "${brand}" no está en el catálogo`);
        }

        if (rubro && !masterData.categories[rubro]) {
            errors.push(`Fila ${index + 1}: Rubro "${rubro}" no existe`);
        }

        if (rubro && subrubro && masterData.categories[rubro] && !masterData.categories[rubro].includes(subrubro)) {
            errors.push(`Fila ${index + 1}: Subrubro "${subrubro}" no existe en rubro "${rubro}"`);
        }

        if (stockTotal && (isNaN(stockTotal) || parseInt(stockTotal) < 0)) {
            errors.push(`Fila ${index + 1}: Stock debe ser un número entero positivo`);
        }

        if (costPrice && (isNaN(costPrice) || parseFloat(costPrice) < 0)) {
            errors.push(`Fila ${index + 1}: Costo debe ser un número positivo`);
        }

        return errors;
    };

    // Función para procesar archivo cargado
    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const rawData = await readExcelFile(file);
            
            if (rawData.length < 2) {
                throw new Error('El archivo debe tener al menos una fila de encabezados y una fila de datos');
            }

            // Saltar la primera fila (headers) y procesar datos
            const dataRows = rawData.slice(1).filter(row => 
                row.some(cell => cell !== undefined && cell !== null && cell.toString().trim() !== '')
            );

            if (dataRows.length === 0) {
                throw new Error('No se encontraron datos válidos en el archivo');
            }

            // Validar todos los datos
            let allErrors = [];
            const processedData = dataRows.map((row, index) => {
                const errors = validateRowData(row, index);
                allErrors = [...allErrors, ...errors];

                const [sku, name, brand, supplierId, rubro, subrubro, stockTotal, costPrice] = row;
                
                return {
                    sku: sku ? sku.toString().trim().toUpperCase() : '',
                    name: name ? name.toString().trim() : '',
                    brand: brand ? brand.toString().trim() : '',
                    supplier_id: supplierId ? parseInt(supplierId) : null,
                    rubro: rubro ? rubro.toString().trim() : '',
                    subrubro: subrubro ? subrubro.toString().trim() : '',
                    stock_total: stockTotal ? parseInt(stockTotal) : 0,
                    cost_price: costPrice ? parseFloat(costPrice) : 0,
                    rowNumber: index + 2, // +2 porque empezamos desde la fila 2 del Excel
                    errors: errors
                };
            });

            if (allErrors.length > 0) {
                showMessage(`Se encontraron ${allErrors.length} errores de validación. Revisa la vista previa.`, 'warning');
            }

            setPreviewData(processedData);
            setShowPreview(true);

        } catch (error) {
            showMessage(`Error al procesar archivo: ${error.message}`, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    // Función para confirmar importación
    const handleConfirmImport = async () => {
        setIsImporting(true);
        try {
            const validData = previewData.filter(item => item.errors.length === 0);
            
            if (validData.length === 0) {
                throw new Error('No hay datos válidos para importar');
            }

            let newProducts = 0;
            let updatedProducts = 0;
            let errors = 0;

            for (const item of validData) {
                try {
                    // Verificar si el producto ya existe
                    const existingProduct = products.find(p => 
                        p.sku.toLowerCase() === item.sku.toLowerCase()
                    );

                    if (existingProduct) {
                        // Actualizar producto existente
                        const updateData = {
                            name: item.name || existingProduct.name,
                            brand: item.brand || existingProduct.brand,
                            supplier_id: item.supplier_id || existingProduct.supplier_id,
                            rubro: item.rubro || existingProduct.rubro,
                            subrubro: item.subrubro || existingProduct.subrubro,
                            stock_total: item.stock_total,
                            stock_disponible: item.stock_total, // Asumimos que todo el stock está disponible
                            cost_price: item.cost_price || existingProduct.cost_price
                        };

                        // Calcular precio de venta si hay proveedor y costo
                        if (updateData.supplier_id && updateData.cost_price > 0) {
                            const supplier = suppliers.find(s => s.id === updateData.supplier_id);
                            if (supplier && supplier.markup) {
                                const markup = 1 + (supplier.markup / 100);
                                updateData.sale_price = (updateData.cost_price * markup).toFixed(2);
                            }
                        }

                        const { error } = await supabase
                            .from('products')
                            .update(updateData)
                            .eq('id', existingProduct.id);

                        if (error) throw error;
                        updatedProducts++;
                    } else {
                        // Crear nuevo producto
                        const newProductData = {
                            sku: item.sku,
                            name: item.name,
                            brand: item.brand,
                            supplier_id: item.supplier_id,
                            rubro: item.rubro,
                            subrubro: item.subrubro,
                            stock_total: item.stock_total,
                            stock_reservado: 0,
                            stock_disponible: item.stock_total,
                            cost_price: item.cost_price,
                            sale_price: 0
                        };

                        // Calcular precio de venta si hay proveedor y costo
                        if (newProductData.supplier_id && newProductData.cost_price > 0) {
                            const supplier = suppliers.find(s => s.id === newProductData.supplier_id);
                            if (supplier && supplier.markup) {
                                const markup = 1 + (supplier.markup / 100);
                                newProductData.sale_price = (newProductData.cost_price * markup).toFixed(2);
                            }
                        }

                        const { error } = await supabase
                            .from('products')
                            .insert([newProductData]);

                        if (error) throw error;
                        newProducts++;
                    }
                } catch (itemError) {
                    console.error(`Error procesando SKU ${item.sku}:`, itemError);
                    errors++;
                }
            }

            setImportStats({ newProducts, updatedProducts, errors, total: validData.length });
            
            // Actualizar la lista de productos
            await fetchProducts();
            
            showMessage(
                `Importación completada: ${newProducts} productos nuevos, ${updatedProducts} actualizados, ${errors} errores`,
                errors > 0 ? 'warning' : 'success'
            );

            // Limpiar
            setShowPreview(false);
            setPreviewData([]);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }

        } catch (error) {
            showMessage(`Error durante la importación: ${error.message}`, 'error');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-6">Importación y Exportación de Inventario</h2>
                
                {/* Sección de Exportación */}
                <div className="mb-8">
                    <h3 className="text-lg font-semibold text-white mb-4">Exportar Inventario</h3>
                    <div className="flex flex-wrap gap-4">
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isExporting ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                    Exportando...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
                                    </svg>
                                    Exportar Inventario Actual
                                </>
                            )}
                        </button>
                        
                        <button
                            onClick={handleExportTemplate}
                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                            Descargar Plantilla
                        </button>
                    </div>
                </div>

                {/* Sección de Importación */}
                <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Importar desde Excel</h3>
                    <div className="border-2 border-dashed border-gray-600 rounded-lg p-6">
                        <div className="text-center">
                            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <div className="mt-4">
                                <label htmlFor="file-upload" className="cursor-pointer">
                                    <span className="mt-2 block text-sm font-medium text-gray-300">
                                        Selecciona un archivo Excel (.xlsx) o arrastra aquí
                                    </span>
                                    <input
                                        ref={fileInputRef}
                                        id="file-upload"
                                        type="file"
                                        accept=".xlsx,.xls"
                                        onChange={handleFileUpload}
                                        className="sr-only"
                                        disabled={isImporting}
                                    />
                                </label>
                                <p className="text-xs text-gray-400 mt-2">
                                    Formato: SKU, Nombre, Marca, Proveedor_ID, Rubro, Subrubro, Stock_Total, Costo
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Estadísticas de importación */}
                {importStats && (
                    <div className="mt-6 p-4 bg-gray-700 rounded-lg">
                        <h4 className="text-white font-semibold mb-2">Última Importación:</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="text-center">
                                <div className="text-green-400 font-bold text-lg">{importStats.newProducts}</div>
                                <div className="text-gray-300">Nuevos</div>
                            </div>
                            <div className="text-center">
                                <div className="text-blue-400 font-bold text-lg">{importStats.updatedProducts}</div>
                                <div className="text-gray-300">Actualizados</div>
                            </div>
                            <div className="text-center">
                                <div className="text-red-400 font-bold text-lg">{importStats.errors}</div>
                                <div className="text-gray-300">Errores</div>
                            </div>
                            <div className="text-center">
                                <div className="text-white font-bold text-lg">{importStats.total}</div>
                                <div className="text-gray-300">Total</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Vista Previa */}
            {showPreview && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-700">
                            <h3 className="text-xl font-bold text-white">Vista Previa de Importación</h3>
                            <p className="text-gray-300 mt-2">
                                {previewData.length} filas detectadas. 
                                {previewData.filter(item => item.errors.length === 0).length} válidas, 
                                {previewData.filter(item => item.errors.length > 0).length} con errores.
                            </p>
                        </div>
                        
                        <div className="flex-1 overflow-auto p-6">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-gray-300">
                                    <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                                        <tr>
                                            <th className="px-4 py-2">Fila</th>
                                            <th className="px-4 py-2">SKU</th>
                                            <th className="px-4 py-2">Nombre</th>
                                            <th className="px-4 py-2">Marca</th>
                                            <th className="px-4 py-2">Stock</th>
                                            <th className="px-4 py-2">Costo</th>
                                            <th className="px-4 py-2">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.map((item, index) => (
                                            <tr key={index} className={`${item.errors.length > 0 ? 'bg-red-900/20' : 'bg-gray-800'} border-b border-gray-700`}>
                                                <td className="px-4 py-2">{item.rowNumber}</td>
                                                <td className="px-4 py-2 font-mono">{item.sku}</td>
                                                <td className="px-4 py-2">{item.name}</td>
                                                <td className="px-4 py-2">{item.brand}</td>
                                                <td className="px-4 py-2">{item.stock_total}</td>
                                                <td className="px-4 py-2">
                                                    {item.errors.length === 0 ? (
                                                        <span className="text-green-400">✓ Válido</span>
                                                    ) : (
                                                        <div className="text-red-400">
                                                            <div>✗ {item.errors.length} error(es)</div>
                                                            <div className="text-xs mt-1">
                                                                {item.errors.slice(0, 2).map((error, i) => (
                                                                    <div key={i}>{error}</div>
                                                                ))}
                                                                {item.errors.length > 2 && <div>...</div>}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <div className="p-6 border-t border-gray-700 flex justify-end gap-4">
                            <button
                                onClick={() => {
                                    setShowPreview(false);
                                    setPreviewData([]);
                                }}
                                disabled={isProcessing}
                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmImport}
                                disabled={isImporting || isProcessing || previewData.filter(item => item.errors.length === 0).length === 0}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        Procesando...
                                    </>
                                ) : (
                                    `Confirmar Importación (${previewData.filter(item => item.errors.length === 0).length} productos)`
                                )}
                            </button>
                        </div>

                        {/* Barra de progreso durante importación */}
                        {isProcessing && (
                            <div className="p-6 border-t border-gray-700 bg-gray-900">
                                <div className="mb-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-sm font-medium text-gray-300">
                                            Progreso de importación
                                        </span>
                                        <span className="text-sm text-gray-400">
                                            {importProgress.current} / {importProgress.total} productos
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-700 rounded-full h-3">
                                        <div 
                                            className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                                            style={{ width: `${importProgress.percentage}%` }}
                                        ></div>
                                    </div>
                                    <div className="text-center mt-2">
                                        <span className="text-lg font-bold text-blue-400">
                                            {importProgress.percentage}%
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="text-xs text-gray-400 text-center">
                                    Procesando en lotes de {BATCH_SIZE} productos para optimizar rendimiento...
                                    <br />
                                    No cierres esta ventana hasta que termine el proceso.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExcelImportExport;