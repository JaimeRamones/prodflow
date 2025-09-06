// Ruta: src/components/Tools.js
import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

// --- HERRAMIENTA 1: GESTOR DE PROVEEDORES (SIN CAMBIOS) ---
const SuppliersManager = () => {
    const { showMessage, suppliers, fetchSuppliers, products, fetchProducts } = useContext(AppContext);
    const [supplierName, setSupplierName] = useState('');
    const [markup, setMarkup] = useState('');
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    const handleSaveSupplier = async () => {
        if (!supplierName || !markup || isNaN(parseFloat(markup))) {
            showMessage("Nombre del proveedor y recargo válido son obligatorios.", "error");
            return;
        }
        setIsSubmitting(true);
        const supplierData = { name: supplierName, markup: parseFloat(markup) };
        try {
            let error;
            if (editingSupplier) {
                const response = await supabase.from('suppliers').update(supplierData).eq('id', editingSupplier.id);
                error = response.error;
            } else {
                const response = await supabase.from('suppliers').insert([supplierData]);
                error = response.error;
            }
            if (error) throw error;
            showMessage(editingSupplier ? "Proveedor actualizado." : "Proveedor creado.", "success");
            await fetchSuppliers();
            setEditingSupplier(null);
            setSupplierName('');
            setMarkup('');
        } catch (error) {
            showMessage(`Error al guardar el proveedor: ${error.message}`, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (supplier) => {
        setEditingSupplier(supplier);
        setSupplierName(supplier.name);
        setMarkup(supplier.markup);
    };

    const handleDelete = async (supplierId) => {
        if (window.confirm("¿Estás seguro de que quieres eliminar este proveedor?")) {
            try {
                const { error } = await supabase.from('suppliers').delete().eq('id', supplierId);
                if (error) throw error;
                showMessage("Proveedor eliminado.", "success");
                await fetchSuppliers();
            } catch (error) {
                showMessage(`Error al eliminar: ${error.message}`, "error");
            }
        }
    };
    
    const handleApplyRuleToProducts = async (supplier) => {
        const productsToUpdate = products.filter(p => p.supplier_id === supplier.id);
        if (productsToUpdate.length === 0) {
            showMessage(`No se encontraron productos para el proveedor '${supplier.name}'.`, "info");
            return;
        }
        if (!window.confirm(`Esto recalculará el precio de venta para ${productsToUpdate.length} producto(s) del proveedor '${supplier.name}'. ¿Deseas continuar?`)) {
            return;
        }
        setIsApplying(true);
        try {
            const markup = 1 + (supplier.markup / 100);
            const updatePromises = productsToUpdate.map(product => {
                const newSalePrice = (product.cost_price || 0) * markup;
                return supabase
                    .from('products')
                    .update({ sale_price: parseFloat(newSalePrice.toFixed(2)) })
                    .eq('id', product.id);
            });
            const results = await Promise.all(updatePromises);
            const firstError = results.find(res => res.error);
            if (firstError) {
                throw firstError.error;
            }
            showMessage(`Precios actualizados para ${productsToUpdate.length} productos.`, "success");
            await fetchProducts();
        } catch (error) {
            showMessage(`Error al aplicar la regla: ${error.message}`, "error");
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md mb-8">
            <h3 className="text-xl font-semibold text-white mb-4">1. Gestionar Proveedores y Recargos (%)</h3>
            <div className="flex flex-col md:flex-row items-end gap-4 mb-4 p-4 bg-gray-900/50 rounded-lg">
                <div className="flex-grow w-full"><label className="block text-sm font-medium text-gray-300 mb-1">Nombre del Proveedor</label><input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" placeholder="Ej: Rodamet" /></div>
                <div className="w-full md:w-48"><label className="block text-sm font-medium text-gray-300 mb-1">Recargo sobre Costo (%)</label><input type="number" value={markup} onChange={e => setMarkup(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" placeholder="Ej: 60" /></div>
                <button onClick={handleSaveSupplier} disabled={isSubmitting} className="w-full md:w-auto px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Guardando...' : (editingSupplier ? 'Actualizar' : 'Guardar')}</button>
            </div>
            <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-300 uppercase bg-gray-700"><tr><th className="px-4 py-2">Proveedor</th><th className="px-4 py-2">Recargo (%)</th><th className="px-4 py-2 text-center">Acciones</th></tr></thead>
                <tbody className="divide-y divide-gray-700">
                    {suppliers.map(supplier => (<tr key={supplier.id}><td className="px-4 py-2 font-semibold text-white">{supplier.name}</td><td className="px-4 py-2">{supplier.markup}%</td><td className="px-4 py-2 text-center"><button onClick={() => handleEdit(supplier)} className="font-medium text-blue-400 hover:underline mr-4">Editar</button><button onClick={() => handleDelete(supplier.id)} className="font-medium text-red-400 hover:underline mr-4">Eliminar</button><button onClick={() => handleApplyRuleToProducts(supplier)} disabled={isApplying} className="font-medium text-green-400 hover:underline disabled:opacity-50">Aplicar Regla</button></td></tr>))}
                </tbody>
            </table>
        </div>
    );
};

// --- HERRAMIENTA 2: GESTOR DE RUBROS Y SUBRUBROS (SIN CAMBIOS) ---
const CategoriesManager = () => {
    const { showMessage, categories, fetchCategories } = useContext(AppContext);
    const [newRubro, setNewRubro] = useState('');
    const [newSubrubroInputs, setNewSubrubroInputs] = useState({});

    const handleAddRubro = async () => {
        if (!newRubro) return;
        try {
            const { error } = await supabase.from('categories').insert([{ name: newRubro, subcategories: [] }]);
            if (error) throw error;
            setNewRubro('');
            await fetchCategories();
        } catch (error) { showMessage(`Error al añadir rubro: ${error.message}`, "error"); }
    };

    const handleAddSubrubro = async (category) => {
        const subrubroName = newSubrubroInputs[category.id];
        if (!subrubroName) return;
        const updatedSubcategories = [...category.subcategories, subrubroName];
        try {
            const { error } = await supabase.from('categories').update({ subcategories: updatedSubcategories }).eq('id', category.id);
            if (error) throw error;
            setNewSubrubroInputs(prev => ({ ...prev, [category.id]: '' }));
            await fetchCategories();
        } catch (error) { showMessage(`Error al añadir subrubro: ${error.message}`, "error"); }
    };
    
    const handleDeleteSubrubro = async (category, subrubroNameToDelete) => {
        const updatedSubcategories = category.subcategories.filter(s => s !== subrubroNameToDelete);
        try {
            const { error } = await supabase.from('categories').update({ subcategories: updatedSubcategories }).eq('id', category.id);
            if (error) throw error;
            await fetchCategories();
        } catch (error) { showMessage(`Error al eliminar subrubro: ${error.message}`, "error"); }
    };

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md mb-8">
            <h3 className="text-xl font-semibold text-white mb-4">2. Gestionar Rubros y Subrubros</h3>
            <div className="flex items-center gap-4 mb-4 p-4 bg-gray-900/50 rounded-lg"><input type="text" value={newRubro} onChange={e => setNewRubro(e.target.value)} className="flex-grow p-2 bg-gray-700 border border-gray-600 rounded-md text-white" placeholder="Nombre del nuevo Rubro" /><button onClick={handleAddRubro} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">Añadir Rubro</button></div>
            <div className="space-y-4">
                {categories.map(cat => (<div key={cat.id} className="border border-gray-700 rounded-lg p-4"><h4 className="font-bold text-lg text-white">{cat.name}</h4><ul className="list-disc list-inside mt-2 text-gray-300">{cat.subcategories.map(sub => (<li key={sub} className="flex justify-between items-center"><span>{sub}</span><button onClick={() => handleDeleteSubrubro(cat, sub)} className="text-red-500 hover:text-red-700 text-xs">Eliminar</button></li>))}</ul><div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700"><input type="text" value={newSubrubroInputs[cat.id] || ''} onChange={e => setNewSubrubroInputs(prev => ({ ...prev, [cat.id]: e.target.value }))} className="flex-grow p-1 bg-gray-700 border border-gray-600 rounded-md text-white text-sm" placeholder="Añadir subrubro..." /><button onClick={() => handleAddSubrubro(cat)} className="px-3 py-1 bg-gray-600 text-white text-xs font-semibold rounded-md hover:bg-gray-500">Añadir</button></div></div>))}
            </div>
        </div>
    );
};

// --- HERRAMIENTA 3: ACTUALIZACIÓN MASIVA DE COSTOS (SIN CAMBIOS) ---
const BulkPriceUpdater = () => {
    const { products, suppliers, categories, showMessage, fetchProducts } = useContext(AppContext);
    const [selectedBrand, setSelectedBrand] = useState('');
    const [selectedRubro, setSelectedRubro] = useState('');
    const [updateValue, setUpdateValue] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const uniqueBrands = useMemo(() => Array.from(new Set(products.map(p => p.brand).filter(Boolean))).sort(), [products]);

    const handleUpdatePrices = async () => {
        if (!updateValue || isNaN(parseFloat(updateValue))) {
            showMessage("Por favor, ingresa un porcentaje de aumento válido.", "error"); return;
        }
        const percentageIncrease = 1 + (parseFloat(updateValue) / 100);
        let productsToUpdate = products.filter(p => (!selectedBrand || p.brand === selectedBrand) && (!selectedRubro || p.rubro === selectedRubro));
        if (productsToUpdate.length === 0) {
            showMessage("No se encontraron productos que coincidan con los filtros.", "info"); return;
        }
        if (!window.confirm(`Se van a actualizar ${productsToUpdate.length} productos. El precio de costo aumentará un ${updateValue}% y el precio de venta se recalculará según la regla del proveedor. ¿Deseas continuar?`)) {
            return;
        }
        setIsSubmitting(true);
        try {
            const updatePromises = productsToUpdate.map(product => {
                const supplierRule = suppliers.find(s => s.id === product.supplier_id);
                const markup = supplierRule ? (1 + (supplierRule.markup / 100)) : 1.0;
                const newCostPrice = (product.cost_price || 0) * percentageIncrease;
                const newSalePrice = newCostPrice * markup;
                return supabase
                    .from('products')
                    .update({
                        cost_price: parseFloat(newCostPrice.toFixed(2)),
                        sale_price: parseFloat(newSalePrice.toFixed(2))
                    })
                    .eq('id', product.id);
            });
            const results = await Promise.all(updatePromises);
            const firstError = results.find(res => res.error);
            if (firstError) throw firstError.error;

            await fetchProducts();
            showMessage(`${productsToUpdate.length} productos actualizados con éxito.`, "success");
        } catch (error) {
            showMessage(`Error en la actualización masiva: ${error.message}`, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md mb-8">
            <h3 className="text-xl font-semibold text-white mb-4">3. Actualización Masiva de Precios de Costo</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-gray-700 pb-4 mb-4">
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Filtrar por Marca</label><select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"><option value="">Todas</option>{uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Filtrar por Rubro</label><select value={selectedRubro} onChange={e => setSelectedRubro(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"><option value="">Todos</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-gray-300 mb-1">Aumentar Costo en (%)</label><input type="number" value={updateValue} onChange={e => setUpdateValue(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" placeholder="Ej: 7" /></div>
            </div>
            <div className="mt-6 flex justify-end"><button onClick={handleUpdatePrices} disabled={isSubmitting} className="px-5 py-2.5 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition disabled:opacity-50">{isSubmitting ? 'Actualizando...' : 'Ejecutar Actualización Masiva'}</button></div>
        </div>
    );
};


// --- HERRAMIENTA 4: MOTOR DE REGLAS DE NEGOCIO (SIN CAMBIOS) ---
const RulesManager = () => {
    const { showMessage } = useContext(AppContext);
    const [rules, setRules] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchRules = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('business_rules')
                .select('*')
                .order('id');
            if (error) {
                showMessage(`Error al cargar las reglas: ${error.message}`, 'error');
            } else {
                setRules(data);
            }
            setIsLoading(false);
        };
        fetchRules();
    }, [showMessage]);

    const handleConfigChange = (id, field, value, isNumeric = false, isArray = false) => {
        setRules(currentRules =>
            currentRules.map(rule => {
                if (rule.id === id) {
                    let finalValue = value;
                    if (isNumeric) finalValue = parseFloat(value) || 0;
                    if (isArray) finalValue = value.split(',').map(item => item.trim());
                    
                    const newConfig = { ...rule.config, [field]: finalValue };
                    return { ...rule, config: newConfig };
                }
                return rule;
            })
        );
    };
    
    // Especial para el textarea de JSON
    const handleJsonChange = (id, jsonString) => {
         setRules(currentRules =>
            currentRules.map(rule => {
                if (rule.id === id) {
                    try {
                        const newConfig = JSON.parse(jsonString);
                        return { ...rule, config: newConfig };
                    } catch(e) {
                        // Si el JSON es inválido, no actualizamos para evitar errores
                        console.error("JSON inválido:", e);
                        // Idealmente, aquí se podría mostrar un error visual al usuario
                        return rule;
                    }
                }
                return rule;
            })
        );
    };


    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updatePromises = rules.map(rule =>
                supabase.from('business_rules').update({ config: rule.config }).eq('id', rule.id)
            );
            const results = await Promise.all(updatePromises);
            const firstError = results.find(res => res.error);
            if (firstError) throw firstError.error;
            showMessage('Reglas guardadas con éxito!', 'success');
        } catch (error) {
            showMessage(`Error al guardar las reglas: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    if (isLoading) {
        return <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md mb-8"><p className="text-center text-gray-400">Cargando Motor de Reglas...</p></div>;
    }

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md mb-8">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-white">4. Motor de Reglas (Kits y Precios Premium)</h3>
                 <button onClick={handleSave} disabled={isSaving} className="px-5 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:opacity-50">
                    {isSaving ? 'Guardando...' : 'Guardar Reglas'}
                 </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {rules.map(rule => {
                    switch (rule.rule_type) {
                        case 'premium_fee':
                            return (<div key={rule.id}><label className="block text-sm font-medium text-gray-300 mb-1">{rule.rule_name} (%)</label><input type="number" value={rule.config.fee_percentage || ''} onChange={(e) => handleConfigChange(rule.id, 'fee_percentage', e.target.value, true)} className="w-full p-2 bg-gray-700 border-gray-600 rounded-md text-white" /></div>);
                        case 'kit_config':
                            return (<div key={rule.id} className="space-y-2"><label className="block text-sm font-medium text-gray-300">{rule.rule_name}</label><div className="flex items-center"><input type="checkbox" checked={rule.config.apply_to_all || false} onChange={(e) => handleConfigChange(rule.id, 'apply_to_all', e.target.checked)} className="w-4 h-4 mr-2 bg-gray-700 border-gray-600" /><span className="text-white">Aplicar a todos los SKUs</span></div><div><label className="text-xs text-gray-400">Multiplicadores (separados por coma)</label><input type="text" value={(rule.config.multipliers || []).join(',')} onChange={(e) => handleConfigChange(rule.id, 'multipliers', e.target.value.split(',').map(n=>parseInt(n.trim())).filter(Boolean))} className="w-full p-2 mt-1 bg-gray-700 border-gray-600 rounded-md text-white" /></div><div><label className="text-xs text-gray-400">Prefijos a excluir (separados por coma)</label><input type="text" value={(rule.config.excluded_prefixes || []).join(',')} onChange={(e) => handleConfigChange(rule.id, 'excluded_prefixes', e.target.value, false, true)} className="w-full p-2 mt-1 bg-gray-700 border-gray-600 rounded-md text-white" /></div></div>);
                        case 'special_rules':
                             return (<div key={rule.id}><label className="block text-sm font-medium text-gray-300 mb-1">{rule.rule_name} (JSON)</label><textarea value={JSON.stringify(rule.config, null, 2)} onChange={(e) => handleJsonChange(rule.id, e.target.value)} className="w-full h-32 p-2 bg-gray-900 border-gray-600 rounded-md text-white font-mono" /></div>);
                        default:
                            // Soporte para la estructura 'Configuración General'
                             if (rule.rule_type === 'Configuración General') {
                                return (
                                    <div key={rule.id} className="col-span-2 space-y-4 p-4 bg-gray-700/50 rounded-lg">
                                        <h4 className="text-lg font-medium text-white">{rule.rule_name} (Estructura Consolidada)</h4>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-1">Markup Base (%)</label>
                                                <input type="number" value={rule.config.defaultMarkup || ''} onChange={(e) => handleConfigChange(rule.id, 'defaultMarkup', e.target.value, true)} className="w-full p-2 bg-gray-700 border-gray-600 rounded-md text-white" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-300 mb-1">Markup Premium (%)</label>
                                                <input type="number" value={rule.config.premiumMarkup || ''} onChange={(e) => handleConfigChange(rule.id, 'premiumMarkup', e.target.value, true)} className="w-full p-2 bg-gray-700 border-gray-600 rounded-md text-white" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">Reglas de Kits (JSON Array)</label>
                                             <textarea 
                                                value={JSON.stringify(rule.config.kitRules || [], null, 2)} 
                                                onChange={(e) => {
                                                    try {
                                                        // Intentamos parsear y actualizamos solo si es válido
                                                        const newKitRules = JSON.parse(e.target.value);
                                                        handleConfigChange(rule.id, 'kitRules', newKitRules);
                                                    } catch (err) {
                                                        console.error("Invalid JSON for kitRules", err);
                                                        // Idealmente mostrar un indicador de error visual aquí
                                                    }
                                                }}
                                                className="w-full h-32 p-2 bg-gray-900 border-gray-600 rounded-md text-white font-mono" 
                                                placeholder='[{"quantity": 2, "discount": 5, "suffix": "/X2"}, ...]'
                                             />
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                    }
                })}
            </div>
        </div>
    );
}


// --- HERRAMIENTA 5: MAPEO MASIVO DE SKUS (CORREGIDA CON FORMDATA) ---
const SKUMapper = () => {
    const { showMessage } = useContext(AppContext);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef(null);
    const [importResult, setImportResult] = useState(null);

    // Función para Exportar (Llama a bright-handler) (SIN CAMBIOS)
    const handleExport = async () => {
        setIsExporting(true);
        setImportResult(null);
        try {
            // Invocamos la función 'bright-handler'
            const { data, error } = await supabase.functions.invoke('bright-handler', {
                method: 'POST',
            });

            if (error) {
                const errorMessage = error.message || 'Error desconocido al invocar la función.';
                throw new Error(`Error al exportar: ${errorMessage}`);
            }

            if (typeof data === 'object' && data !== null && (data.message || data.error)) {
                 showMessage(data.message || data.error, data.error ? 'error' : 'info');
                 setIsExporting(false);
                 return;
            }
            
            const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            // Actualizamos el nombre del archivo para reflejar que es el completo
            link.setAttribute('download', 'ProdFlow_Mapeo_SKUs_Completo.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showMessage("Archivo CSV completo descargado. Por favor, edita la columna 'sku' y guárdalo.", "success");

        } catch (error) {
            console.error("Error durante la exportación:", error);
            showMessage(error.message || "Ocurrió un error inesperado al exportar.", "error");
        } finally {
            setIsExporting(false);
        }
    };

    // Función para manejar la selección del archivo (SIN CAMBIOS)
    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            handleImport(file);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    // Función para Importar (Llama a rapid-task) (CORREGIDA)
    const handleImport = async (file) => {
        
        if (!window.confirm("¿Estás seguro de que deseas importar este archivo? Esto sobrescribirá los SKUs actuales.")) {
            return;
        }

        setIsImporting(true);
        setImportResult(null);
        try {
            // CORRECCIÓN: Usamos FormData para enviar el archivo robustamente.
            const formData = new FormData();
            // Adjuntamos el archivo bajo la clave 'file' (como espera el backend).
            formData.append('file', file); 

            // Invocamos la función 'rapid-task' enviando el FormData
            const { data, error } = await supabase.functions.invoke('rapid-task', {
                method: 'POST',
                body: formData, // Enviamos el FormData
                // IMPORTANTE: NO seteamos 'Content-Type' manualmente. 
                // El navegador/librería lo hará automáticamente (multipart/form-data).
            });

            if (error) {
                 const errorMessage = error.message || 'Error desconocido al invocar la función.';
                 throw new Error(`Error al importar: ${errorMessage}`);
            }

            // Mostramos el resultado
            setImportResult(data);
            if (data.success) {
                showMessage(data.message, data.errors.length > 0 ? "warning" : "success");
            } else {
                showMessage(data.error || "Falló la importación.", "error");
            }

        } catch (error) {
            console.error("Error durante la importación:", error);
            showMessage(error.message || "Ocurrió un error inesperado al importar.", "error");
        } finally {
            setIsImporting(false);
        }
    };


    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md mb-8">
            <h3 className="text-xl font-semibold text-white mb-4">5. Mapeo Masivo de SKUs (Mercado Libre)</h3>
            <p className="text-gray-400 mb-4">
                Utiliza esta herramienta para corregir masivamente los SKUs de tus publicaciones. Esto es esencial para que el sincronizador de Kits funcione correctamente.
            </p>
            
            <div className="flex flex-col md:flex-row gap-6 p-4 bg-gray-900/50 rounded-lg">
                
                {/* Paso 1: Exportar */}
                <div className="flex-1 md:border-r border-gray-700 md:pr-6">
                    <h4 className="text-lg font-medium text-white mb-2">Paso 1: Descargar y Editar</h4>
                    <p className="text-sm text-gray-400 mb-4">
                        Descarga el listado completo. Abre el CSV y corrige la columna <code className="text-yellow-400">sku</code>.
                        Asegúrate de que los SKUs coincidan exactamente (Ej: HG31101/X2). No modifiques <code className="text-yellow-400">meli_id</code>.
                    </p>
                    <button 
                        onClick={handleExport} 
                        disabled={isExporting || isImporting}
                        className="w-full px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50 transition duration-150"
                    >
                        {/* Actualizamos el texto del botón */}
                        {isExporting ? 'Exportando...' : 'Descargar CSV Completo'}
                    </button>
                </div>

                {/* Paso 2: Importar */}
                <div className="flex-1">
                    <h4 className="text-lg font-medium text-white mb-2">Paso 2: Subir y Actualizar</h4>
                    <p className="text-sm text-gray-400 mb-4">
                        Una vez corregido el archivo CSV, súbelo aquí. El sistema actualizará los SKUs en la base de datos de forma masiva.
                    </p>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileSelect} 
                        accept=".csv" 
                        className="hidden" 
                    />
                    <button 
                        onClick={() => fileInputRef.current && fileInputRef.current.click()} 
                        disabled={isExporting || isImporting}
                        className="w-full px-5 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:opacity-50 transition duration-150"
                    >
                        {isImporting ? 'Importando...' : 'Subir CSV Corregido'}
                    </button>
                </div>
            </div>

            {/* Resultados de la importación */}
            {importResult && (
                <div className={`mt-4 p-4 rounded-lg ${importResult.errors && importResult.errors.length > 0 ? 'bg-yellow-900 border border-yellow-700' : (importResult.success ? 'bg-green-900 border border-green-700' : 'bg-red-900 border border-red-700')}`}>
                    <p className="font-semibold text-white">{importResult.message || importResult.error}</p>
                    {importResult.errors && importResult.errors.length > 0 && (
                        <div className="mt-2">
                            <p className="text-sm text-yellow-300">Advertencias/Errores (Revisar filas):</p>
                            <ul className="list-disc list-inside text-sm text-yellow-300 max-h-24 overflow-y-auto">
                                {importResult.errors.map((err, index) => (
                                    <li key={index}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


const Tools = () => {
    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-6">Herramientas Administrativas</h2>
            <SuppliersManager />
            <CategoriesManager />
            <BulkPriceUpdater />
            <RulesManager />
            <SKUMapper />
        </div>
    );
};

export default Tools;