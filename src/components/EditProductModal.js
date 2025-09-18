// Ruta: src/components/EditProductModal.js
// Modal de edición completo con OEM, equivalencias y burbujas editables

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import { masterData } from '../masterData';

const EditableTagInput = ({ label, values = [], onChange, placeholder, suggestions = [] }) => {
    const [inputValue, setInputValue] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && inputValue.trim()) {
            e.preventDefault();
            const newValue = inputValue.trim().toUpperCase();
            if (!values.includes(newValue)) {
                onChange([...values, newValue]);
            }
            setInputValue('');
            setShowSuggestions(false);
        }
    };

    const removeValue = (valueToRemove) => {
        onChange(values.filter(v => v !== valueToRemove));
    };

    const addSuggestion = (suggestion) => {
        if (!values.includes(suggestion)) {
            onChange([...values, suggestion]);
        }
        setInputValue('');
        setShowSuggestions(false);
    };

    const filteredSuggestions = suggestions.filter(s => 
        s.toLowerCase().includes(inputValue.toLowerCase()) && !values.includes(s)
    );

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-white">{label}</label>
            
            {/* Burbujas/Tags existentes */}
            <div className="flex flex-wrap gap-2 min-h-[2.5rem] p-2 bg-gray-700 border border-gray-600 rounded-lg">
                {values.map((value, index) => (
                    <span
                        key={index}
                        onClick={() => removeValue(value)}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-600 text-white cursor-pointer hover:bg-red-600 transition-colors"
                        title="Clic para eliminar"
                    >
                        {value}
                        <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </span>
                ))}
                
                {/* Input para agregar nuevos */}
                <div className="relative flex-1 min-w-[200px]">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setShowSuggestions(e.target.value.length > 0 && suggestions.length > 0);
                        }}
                        onKeyPress={handleKeyPress}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder={placeholder}
                        className="w-full px-2 py-1 text-sm bg-transparent border-none outline-none text-white placeholder-gray-400"
                    />
                    
                    {/* Sugerencias */}
                    {showSuggestions && filteredSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
                            {filteredSuggestions.slice(0, 5).map((suggestion, index) => (
                                <div
                                    key={index}
                                    onClick={() => addSuggestion(suggestion)}
                                    className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
                                >
                                    {suggestion}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <p className="text-xs text-gray-400">Escribe y presiona Enter para agregar. Clic en una burbuja para eliminar.</p>
        </div>
    );
};

const FormSelect = ({ label, name, value, onChange, options, placeholder, valueKey = 'id', labelKey = 'name' }) => (
    <div>
        <label htmlFor={`edit-${name}`} className="block mb-2 text-sm font-medium text-white">{label}</label>
        <select id={`edit-${name}`} name={name} value={value} onChange={onChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white">
            <option value="">{placeholder}</option>
            {options && options.map(opt => (
                typeof opt === 'object' 
                ? <option key={opt[valueKey]} value={opt[valueKey]}>{opt[labelKey]}</option> 
                : <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    </div>
);

const EditProductModal = ({ product, onClose, onSave }) => {
    const { suppliers, products, showMessage } = useContext(AppContext);
    const [editedProduct, setEditedProduct] = useState(product);
    const [oemNumbers, setOemNumbers] = useState([]);
    const [crossReferences, setCrossReferences] = useState([]);
    const [equivalentSkus, setEquivalentSkus] = useState([]);
    const [productReferences, setProductReferences] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Sugerencias para autocompletar
    const [availableSkus, setAvailableSkus] = useState([]);

    useEffect(() => {
        setEditedProduct(product);
        
        // Cargar datos existentes del producto
        if (product?.id) {
            loadProductExtendedData(product.id);
        }
        
        // Cargar SKUs disponibles para sugerencias de equivalencias
        if (products) {
            setAvailableSkus(products.map(p => p.sku).filter(sku => sku !== product?.sku));
        }
    }, [product, products]);

    const loadProductExtendedData = async (productId) => {
        try {
            // Cargar referencias OEM del producto
            const { data: refs, error: refsError } = await supabase
                .from('product_references')
                .select('*')
                .eq('product_id', productId);

            if (!refsError && refs) {
                setProductReferences(refs);
                
                // Separar por tipo
                setOemNumbers(refs.filter(r => r.reference_type === 'oem').map(r => r.reference_number));
                setCrossReferences(refs.filter(r => r.reference_type === 'cross_reference').map(r => r.reference_number));
            }

            // Cargar equivalencias
            const { data: equivalents, error: equivError } = await supabase
                .from('product_equivalents')
                .select(`
                    *,
                    equivalent_product:products!equivalent_product_id(sku, name)
                `)
                .eq('main_product_id', productId);

            if (!equivError && equivalents) {
                setEquivalentSkus(equivalents.map(e => e.equivalent_product.sku));
            }

        } catch (error) {
            console.error('Error cargando datos extendidos del producto:', error);
        }
    };

    useEffect(() => {
        if (!editedProduct || !suppliers || suppliers.length === 0) return;
        const cost = parseFloat(editedProduct.cost_price) || 0;
        const supplierId = editedProduct.supplier_id;
        
        const supplierRule = suppliers.find(s => s.id === supplierId);
        
        const markupPercentage = supplierRule ? supplierRule.markup : 0;
        const markup = 1 + (markupPercentage / 100);
        const newSalePrice = cost * markup;

        if (Math.abs(newSalePrice - (parseFloat(editedProduct.sale_price) || 0)) > 0.01) {
            setEditedProduct(prev => ({ ...prev, sale_price: newSalePrice.toFixed(2) }));
        }
    }, [editedProduct?.cost_price, editedProduct?.supplier_id, suppliers]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        const isNumeric = name === 'supplier_id' || name === 'stock_total' || name === 'stock_reservado';
        
        let finalValue;
        if (name === 'cost_price') {
            finalValue = value; 
        } else if (isNumeric) {
            finalValue = value ? parseInt(value, 10) : 0;
        } else {
            finalValue = value;
        }

        const newProductState = { ...editedProduct, [name]: finalValue };

        if (name === 'rubro') {
            newProductState.subrubro = '';
        }
        setEditedProduct(newProductState);
    };

    const handleResetReservedStock = () => {
        setEditedProduct(prev => ({ ...prev, stock_reservado: 0 }));
    };

    const saveProductReferences = async (productId) => {
        try {
            // Eliminar referencias existentes
            await supabase
                .from('product_references')
                .delete()
                .eq('product_id', productId);

            // Insertar nuevas referencias OEM
            const oemRefs = oemNumbers.map(num => ({
                product_id: productId,
                reference_number: num,
                reference_type: 'oem',
                brand: editedProduct.brand || null
            }));

            // Insertar nuevas referencias cruzadas
            const crossRefs = crossReferences.map(num => ({
                product_id: productId,
                reference_number: num,
                reference_type: 'cross_reference',
                brand: null
            }));

            const allRefs = [...oemRefs, ...crossRefs];
            
            if (allRefs.length > 0) {
                const { error: refsError } = await supabase
                    .from('product_references')
                    .insert(allRefs);
                
                if (refsError) throw refsError;
            }

        } catch (error) {
            console.error('Error guardando referencias:', error);
            throw error;
        }
    };

    const saveProductEquivalents = async (productId) => {
        try {
            // Eliminar equivalencias existentes donde este producto es el principal
            await supabase
                .from('product_equivalents')
                .delete()
                .eq('main_product_id', productId);

            // Crear nuevas equivalencias
            const equivalentProducts = await Promise.all(
                equivalentSkus.map(async (sku) => {
                    const { data, error } = await supabase
                        .from('products')
                        .select('id')
                        .eq('sku', sku)
                        .single();
                    
                    if (error || !data) {
                        console.warn(`No se encontró producto con SKU: ${sku}`);
                        return null;
                    }
                    return data.id;
                })
            );

            const validEquivalents = equivalentProducts.filter(id => id !== null);
            
            if (validEquivalents.length > 0) {
                const equivalents = validEquivalents.map(equivId => ({
                    main_product_id: productId,
                    equivalent_product_id: equivId,
                    equivalence_type: 'functional',
                    confidence_level: 90
                }));

                const { error: equivError } = await supabase
                    .from('product_equivalents')
                    .insert(equivalents);
                
                if (equivError) throw equivError;
            }

        } catch (error) {
            console.error('Error guardando equivalencias:', error);
            throw error;
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        
        try {
            // Guardar producto principal (sin stock_disponible para que la DB lo calcule)
            const productToSave = { ...editedProduct };
            delete productToSave.stock_disponible;

            const savedProduct = await onSave(productToSave);
            const productId = savedProduct?.id || editedProduct.id;

            // Guardar referencias OEM y cruzadas
            await saveProductReferences(productId);

            // Guardar equivalencias
            await saveProductEquivalents(productId);

            showMessage('Producto y datos extendidos guardados correctamente', 'success');
            onClose();

        } catch (error) {
            showMessage(`Error al guardar: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (!product) return null;
    
    const rubroOptions = Object.keys(masterData.categories);
    const subrubroOptions = editedProduct.rubro && masterData.categories[editedProduct.rubro]
        ? masterData.categories[editedProduct.rubro]
        : [];

    // Calcular stock disponible en tiempo real para mostrar
    const stockTotal = parseInt(editedProduct.stock_total) || 0;
    const stockReservado = parseInt(editedProduct.stock_reservado) || 0;
    const stockDisponibleCalculado = stockTotal - stockReservado;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] overflow-y-auto">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-white mb-6">Editar Producto: {product.sku}</h2>
                    <form onSubmit={handleSave} className="space-y-6">
                        
                        {/* Información básica */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <FormSelect label="Proveedor" name="supplier_id" value={editedProduct.supplier_id || ''} onChange={handleChange} options={suppliers} placeholder="Seleccionar Proveedor" />
                            <FormSelect label="Marca" name="brand" value={editedProduct.brand || ''} onChange={handleChange} options={masterData.brands} placeholder="Seleccionar Marca" />
                            <FormSelect label="Rubro" name="rubro" value={editedProduct.rubro || ''} onChange={handleChange} options={rubroOptions} placeholder="Seleccionar Rubro" />
                            <FormSelect label="Subrubro" name="subrubro" value={editedProduct.subrubro || ''} onChange={handleChange} options={subrubroOptions} placeholder="Seleccionar Subrubro" />
                        </div>

                        {/* Nombre del producto */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                             <div>
                                <label className="block mb-2 text-sm font-medium text-white">Nombre</label>
                                <input type="text" name="name" value={editedProduct.name || ''} onChange={handleChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" required />
                             </div>
                        </div>

                        {/* Precios */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block mb-2 text-sm font-medium text-white">Costo</label>
                                <input type="number" step="0.01" name="cost_price" value={editedProduct.cost_price || ''} onChange={handleChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" required />
                            </div>
                            <div>
                                <label className="block mb-2 text-sm font-medium text-white">Precio de Venta (Automático)</label>
                                <input type="number" step="0.01" name="sale_price" value={editedProduct.sale_price || ''} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-900/50 border-gray-600 cursor-not-allowed" readOnly />
                            </div>
                        </div>

                        {/* Gestión de Stock */}
                        <div className="pt-4 border-t border-gray-700">
                            <h3 className="text-lg font-semibold text-white mb-4">Gestión de Stock</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block mb-2 text-sm font-medium text-white">Stock Total</label>
                                    <input 
                                        type="number" 
                                        name="stock_total" 
                                        value={editedProduct.stock_total || ''} 
                                        onChange={handleChange} 
                                        className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" 
                                        min="0"
                                    />
                                </div>

                                <div>
                                    <label className="block mb-2 text-sm font-medium text-white">Stock Reservado</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="number" 
                                            name="stock_reservado" 
                                            value={editedProduct.stock_reservado || 0} 
                                            onChange={handleChange} 
                                            className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" 
                                            min="0"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleResetReservedStock}
                                            className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded-lg transition-colors whitespace-nowrap"
                                            title="Resetear a 0"
                                        >
                                            Reset
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block mb-2 text-sm font-medium text-white">Stock Disponible (Calculado)</label>
                                    <input 
                                        type="number" 
                                        value={stockDisponibleCalculado} 
                                        className={`border text-sm rounded-lg block w-full p-2.5 bg-gray-900/50 border-gray-600 cursor-not-allowed ${
                                            stockDisponibleCalculado < 0 ? 'text-red-400' : 'text-green-400'
                                        }`}
                                        readOnly 
                                    />
                                    {stockDisponibleCalculado < 0 && (
                                        <p className="text-xs text-red-400 mt-1">
                                            ⚠️ Stock negativo: Revisa las reservas
                                        </p>
                                    )}
                                </div>

                                <div className="flex flex-col justify-center">
                                    <div className="text-xs text-gray-400 space-y-1">
                                        <div>Fórmula:</div>
                                        <div className="font-mono">Disponible = Total - Reservado</div>
                                        <div className="font-mono">{stockDisponibleCalculado} = {stockTotal} - {stockReservado}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Números OEM y Referencias */}
                        <div className="pt-4 border-t border-gray-700 space-y-4">
                            <h3 className="text-lg font-semibold text-white mb-4">Números Originales y Referencias</h3>
                            
                            <EditableTagInput
                                label="Números OEM / Originales"
                                values={oemNumbers}
                                onChange={setOemNumbers}
                                placeholder="Ej: 12345-ABC-678, 98765-XYZ-321..."
                            />

                            <EditableTagInput
                                label="Referencias Cruzadas"
                                values={crossReferences}
                                onChange={setCrossReferences}
                                placeholder="Ej: REF-123, ALT-456..."
                            />
                        </div>

                        {/* Equivalencias */}
                        <div className="pt-4 border-t border-gray-700">
                            <h3 className="text-lg font-semibold text-white mb-4">Productos Equivalentes</h3>
                            
                            <EditableTagInput
                                label="SKUs Equivalentes"
                                values={equivalentSkus}
                                onChange={setEquivalentSkus}
                                placeholder="Ej: AIMET M 60, ACONTI CT 1126..."
                                suggestions={availableSkus}
                            />
                            
                            <div className="text-xs text-gray-400 mt-2">
                                💡 Tip: Los productos equivalentes son alternativas que pueden reemplazar este SKU cuando no hay stock.
                            </div>
                        </div>
                        
                        {/* Botones de acción */}
                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                            <button 
                                type="button" 
                                onClick={onClose} 
                                disabled={isLoading}
                                className="text-white bg-gray-600 hover:bg-gray-700 font-medium rounded-lg text-sm px-5 py-2.5 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit" 
                                disabled={isLoading}
                                className="text-white bg-blue-600 hover:bg-blue-700 font-medium rounded-lg text-sm px-5 py-2.5 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        Guardando...
                                    </>
                                ) : (
                                    'Guardar Todo'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default EditProductModal;