import React, { useState, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

// --- HERRAMIENTA 1: GESTOR DE PROVEEDORES ---
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
    
    // --- FUNCIÓN CORREGIDA ---
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

            // Creamos un array de promesas, una por cada producto a actualizar
            const updatePromises = productsToUpdate.map(product => {
                const newSalePrice = (product.cost_price || 0) * markup;
                return supabase
                    .from('products')
                    .update({ sale_price: parseFloat(newSalePrice.toFixed(2)) })
                    .eq('id', product.id);
            });

            // Ejecutamos todas las actualizaciones en paralelo
            const results = await Promise.all(updatePromises);

            // Verificamos si alguna de las actualizaciones falló
            const firstError = results.find(res => res.error);
            if (firstError) {
                throw firstError.error;
            }

            showMessage(`Precios actualizados para ${productsToUpdate.length} productos.`, "success");
            await fetchProducts(); // Refrescamos la lista de productos en la app

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

// --- HERRAMIENTA 2: GESTOR DE RUBROS Y SUBRUBROS ---
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

// --- HERRAMIENTA 3: ACTUALIZACIÓN MASIVA DE COSTOS ---
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
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md">
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

const Tools = () => {
    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-6">Herramientas Administrativas</h2>
            <SuppliersManager />
            <CategoriesManager />
            <BulkPriceUpdater />
        </div>
    );
};

export default Tools;
