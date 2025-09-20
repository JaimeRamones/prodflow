import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const EditComboModal = ({ show, onClose, combo }) => {
    const { showMessage, products, suppliers } = useContext(AppContext);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);
    
    // Estados del formulario
    const [formData, setFormData] = useState({
        combo_sku: '',
        combo_name: '',
        description: '',
        category: '',
        subcategory: '',
        markup_percentage: 0,
        fixed_price: '',
        locations: [],
        vehicle_applications: []
    });
    
    // Estados para gestión de componentes
    const [selectedComponents, setSelectedComponents] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [showProductSearch, setShowProductSearch] = useState(false);
    const [supplierStockItems, setSupplierStockItems] = useState([]);

    // Cargar datos del combo cuando se abre el modal
    useEffect(() => {
        if (!show || !combo) {
            setLoading(false);
            return;
        }

        const loadComboData = async () => {
            setLoading(true);
            try {
                // Cargar datos básicos del combo
                setFormData({
                    combo_sku: combo.combo_sku || '',
                    combo_name: combo.combo_name || '',
                    description: combo.description || '',
                    category: combo.category || '',
                    subcategory: combo.subcategory || '',
                    markup_percentage: combo.markup_percentage || 0,
                    fixed_price: combo.fixed_price || '',
                    locations: combo.locations || [],
                    vehicle_applications: combo.vehicle_applications || []
                });

                // Cargar componentes del combo
                const { data: components, error } = await supabase
                    .from('garaje_combo_items')
                    .select('*')
                    .eq('combo_id', combo.id)
                    .order('position');

                if (error) throw error;

                // Enriquecer componentes con datos actuales de productos
                const enrichedComponents = await Promise.all(
                    components.map(async (comp) => {
                        // Buscar en inventario local
                        let productData = products.find(p => p.sku === comp.product_sku);
                        
                        if (!productData) {
                            // Buscar en supplier_stock_items si no está en inventario
                            const { data: supplierProduct } = await supabase
                                .from('supplier_stock_items')
                                .select('*')
                                .eq('sku', comp.product_sku)
                                .single();
                            
                            if (supplierProduct) {
                                productData = {
                                    sku: supplierProduct.sku,
                                    name: supplierProduct.name || supplierProduct.product_name,
                                    brand: supplierProduct.brand,
                                    cost_price: supplierProduct.cost_price,
                                    sale_price: supplierProduct.sale_price,
                                    stock_disponible: supplierProduct.available_quantity,
                                    supplier_id: supplierProduct.supplier_id,
                                    source: 'supplier'
                                };
                            }
                        } else {
                            productData.source = 'inventory';
                        }

                        return {
                            ...comp,
                            // Datos actualizados del producto
                            name: productData?.name || comp.product_name,
                            brand: productData?.brand || '',
                            cost_price: productData?.cost_price || comp.cost_price,
                            sale_price: productData?.sale_price || comp.sale_price,
                            stock_disponible: productData?.stock_disponible || 0,
                            supplier_id: productData?.supplier_id || comp.supplier_id,
                            supplier_name: suppliers.find(s => s.id === (productData?.supplier_id || comp.supplier_id))?.name || comp.supplier_name,
                            source: productData?.source || 'unknown'
                        };
                    })
                );

                setSelectedComponents(enrichedComponents);

                // Cargar stock de proveedores para búsqueda
                const { data: stockData, error: stockError } = await supabase
                    .from('supplier_stock_items')
                    .select('*')
                    .order('sku');
                
                if (stockError) throw stockError;
                setSupplierStockItems(stockData || []);

            } catch (error) {
                showMessage(`Error al cargar datos del combo: ${error.message}`, 'error');
            } finally {
                setLoading(false);
            }
        };

        loadComboData();
    }, [show, combo, products, suppliers, showMessage]);

    // Reset cuando se cierra el modal
    useEffect(() => {
        if (!show) {
            setSearchTerm('');
            setShowProductSearch(false);
        }
    }, [show]);

    // Combinar productos del inventario y proveedores para búsqueda
    const allAvailableProducts = useMemo(() => {
        const inventoryProducts = products.map(p => ({
            sku: p.sku,
            name: p.name,
            brand: p.brand,
            cost_price: p.cost_price,
            sale_price: p.sale_price,
            stock_disponible: p.stock_disponible,
            supplier_id: p.supplier_id,
            supplier_name: suppliers.find(s => s.id === p.supplier_id)?.name || 'Sin proveedor',
            source: 'inventory',
            rubro: p.rubro,
            subrubro: p.subrubro
        }));

        // Adaptar supplier_stock_items a tu estructura real
        const supplierProducts = supplierStockItems.map(item => ({
            sku: item.sku,
            name: `Producto ${item.sku}`, // Nombre genérico ya que no tienes name
            brand: 'Sin marca', // Brand genérico ya que no tienes brand
            cost_price: item.cost_price,
            sale_price: item.cost_price * 1.3, // Markup default del 30%
            stock_disponible: item.quantity, // quantity en lugar de available_quantity
            supplier_id: null, // No tienes supplier_id en esta tabla
            supplier_name: 'Proveedor externo',
            source: 'supplier'
        }));

        return [...inventoryProducts, ...supplierProducts];
    }, [products, supplierStockItems, suppliers]);

    // Filtrar productos disponibles para búsqueda
    const filteredProducts = useMemo(() => {
        if (!searchTerm) return [];
        
        return allAvailableProducts
            .filter(product => 
                !selectedComponents.some(comp => comp.product_sku === product.sku) &&
                (product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 (product.brand && product.brand.toLowerCase().includes(searchTerm.toLowerCase())))
            )
            .slice(0, 20);
    }, [allAvailableProducts, selectedComponents, searchTerm]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const addComponent = (product) => {
        const newComponent = {
            product_sku: product.sku,
            name: product.name,
            brand: product.brand,
            cost_price: product.cost_price,
            sale_price: product.sale_price,
            stock_disponible: product.stock_disponible,
            supplier_id: product.supplier_id,
            supplier_name: product.supplier_name,
            quantity: 1,
            source: product.source,
            position: selectedComponents.length
        };
        
        setSelectedComponents(prev => [...prev, newComponent]);
        setSearchTerm('');
        setShowProductSearch(false);
    };

    const removeComponent = (sku) => {
        setSelectedComponents(prev => prev.filter(comp => comp.product_sku !== sku));
    };

    const updateComponentQuantity = (sku, quantity) => {
        if (quantity < 1) return;
        
        setSelectedComponents(prev => 
            prev.map(comp => 
                comp.product_sku === sku ? { ...comp, quantity } : comp
            )
        );
    };

    const addLocation = (location) => {
        if (location && !formData.locations.includes(location)) {
            handleInputChange('locations', [...formData.locations, location]);
        }
    };

    const removeLocation = (location) => {
        handleInputChange('locations', formData.locations.filter(loc => loc !== location));
    };

    // Calcular stock disponible del combo
    const calculateComboStock = useMemo(() => {
        if (selectedComponents.length === 0) return 0;
        
        const stockLevels = selectedComponents.map(comp => 
            Math.floor((comp.stock_disponible || 0) / comp.quantity)
        );
        
        return Math.min(...stockLevels);
    }, [selectedComponents]);

    // Calcular precios del combo
    const comboPricing = useMemo(() => {
        const totalCost = selectedComponents.reduce((sum, comp) => 
            sum + (comp.cost_price * comp.quantity), 0
        );
        
        const totalSalePrice = selectedComponents.reduce((sum, comp) => 
            sum + (comp.sale_price * comp.quantity), 0
        );
        
        const finalPrice = formData.fixed_price 
            ? parseFloat(formData.fixed_price) 
            : totalSalePrice * (1 + (formData.markup_percentage / 100));
        
        const margin = totalCost > 0 ? ((finalPrice - totalCost) / totalCost) * 100 : 0;
        
        return {
            totalCost,
            totalSalePrice,
            finalPrice,
            margin
        };
    }, [selectedComponents, formData.markup_percentage, formData.fixed_price]);

    // Generar descripción automática
    const generateDescription = () => {
        if (selectedComponents.length === 0) return '';
        
        const brands = [...new Set(selectedComponents.map(comp => comp.brand).filter(Boolean))];
        const locations = formData.locations.length > 0 ? formData.locations.join(', ') : '';
        
        let description = `Kit completo que incluye:\n`;
        selectedComponents.forEach((comp, index) => {
            description += `• ${comp.quantity}x ${comp.name}${comp.brand ? ` (${comp.brand})` : ''}\n`;
        });
        
        if (brands.length > 0) {
            description += `\nMarcas incluidas: ${brands.join(', ')}`;
        }
        
        if (locations) {
            description += `\nUbicaciones: ${locations}`;
        }
        
        description += `\n\nKit armado profesionalmente para garantizar compatibilidad y calidad.`;
        
        return description;
    };

    // Guardar cambios
    const handleSave = async () => {
        if (!formData.combo_sku.trim() || !formData.combo_name.trim()) {
            showMessage('SKU y nombre del combo son obligatorios.', 'error');
            return;
        }
        
        if (selectedComponents.length === 0) {
            showMessage('Debes agregar al menos un componente al combo.', 'error');
            return;
        }
        
        setIsSubmitting(true);
        
        try {
            // Verificar que el SKU no exista en otro combo
            if (formData.combo_sku !== combo.combo_sku) {
                const { data: existingCombo } = await supabase
                    .from('garaje_combos')
                    .select('id')
                    .eq('combo_sku', formData.combo_sku.trim())
                    .neq('id', combo.id)
                    .single();
                
                if (existingCombo) {
                    showMessage('Ya existe otro combo con ese SKU.', 'error');
                    return;
                }
            }

            const brands = [...new Set(selectedComponents.map(comp => comp.brand).filter(Boolean))];
            
            // Actualizar el combo
            const comboData = {
                ...formData,
                combo_sku: formData.combo_sku.trim(),
                brands,
                description: formData.description || generateDescription(),
                meli_description: generateDescription(),
                updated_at: new Date().toISOString()
            };
            
            const { error: comboError } = await supabase
                .from('garaje_combos')
                .update(comboData)
                .eq('id', combo.id);
            
            if (comboError) throw comboError;
            
            // Eliminar componentes existentes
            const { error: deleteError } = await supabase
                .from('garaje_combo_items')
                .delete()
                .eq('combo_id', combo.id);
            
            if (deleteError) throw deleteError;
            
            // Agregar nuevos componentes
            const componentData = selectedComponents.map((comp, index) => ({
                combo_id: combo.id,
                product_sku: comp.product_sku,
                quantity: comp.quantity,
                product_name: comp.name,
                cost_price: comp.cost_price,
                sale_price: comp.sale_price,
                supplier_id: comp.supplier_id,
                supplier_name: comp.supplier_name,
                position: index
            }));
            
            const { error: componentsError } = await supabase
                .from('garaje_combo_items')
                .insert(componentData);
            
            if (componentsError) throw componentsError;
            
            showMessage(`Combo "${formData.combo_name}" actualizado con éxito.`, 'success');
            onClose();
            
        } catch (error) {
            showMessage(`Error al actualizar combo: ${error.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatPrice = (price) => {
        return new Intl.NumberFormat('es-AR', { 
            style: 'currency', 
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        }).format(price || 0);
    };

    if (!show || !combo) return null;

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-gray-800 rounded-lg p-8">
                    <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
                        <span className="text-white">Cargando datos del combo...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 className="text-xl font-semibold text-white">Editar Combo: {combo.combo_name}</h3>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Columna izquierda - Información del combo */}
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-lg font-semibold text-white mb-4">Información del Combo</h4>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">
                                            SKU del Combo *
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.combo_sku}
                                            onChange={(e) => handleInputChange('combo_sku', e.target.value)}
                                            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                                            placeholder="Ej: Kit filtros Bosch 31 HAB"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">
                                            Nombre del Combo *
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.combo_name}
                                            onChange={(e) => handleInputChange('combo_name', e.target.value)}
                                            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                                            placeholder="Nombre descriptivo del combo"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">Categoría</label>
                                            <input
                                                type="text"
                                                value={formData.category}
                                                onChange={(e) => handleInputChange('category', e.target.value)}
                                                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                                                placeholder="Ej: Filtros"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">Subcategoría</label>
                                            <input
                                                type="text"
                                                value={formData.subcategory}
                                                onChange={(e) => handleInputChange('subcategory', e.target.value)}
                                                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                                                placeholder="Ej: Aceite y Aire"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">Descripción</label>
                                        <div className="flex gap-2">
                                            <textarea
                                                value={formData.description}
                                                onChange={(e) => handleInputChange('description', e.target.value)}
                                                className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                                                rows="4"
                                                placeholder="Descripción del combo..."
                                            />
                                            <button
                                                onClick={() => handleInputChange('description', generateDescription())}
                                                className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 self-start"
                                                title="Generar descripción automática"
                                            >
                                                IA
                                            </button>
                                        </div>
                                    </div>

                                    {/* Ubicaciones */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">Ubicaciones/Lados</label>
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {formData.locations.map((location, index) => (
                                                <span key={index} className="px-2 py-1 bg-purple-600 text-white text-xs rounded-full flex items-center">
                                                    {location}
                                                    <button
                                                        onClick={() => removeLocation(location)}
                                                        className="ml-1 text-purple-200 hover:text-white"
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            {['Delantero', 'Trasero', 'Izquierdo', 'Derecho', 'Superior', 'Inferior'].map(loc => (
                                                <button
                                                    key={loc}
                                                    onClick={() => addLocation(loc)}
                                                    className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-500"
                                                >
                                                    {loc}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Precios */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">Markup Adicional (%)</label>
                                            <input
                                                type="number"
                                                value={formData.markup_percentage}
                                                onChange={(e) => handleInputChange('markup_percentage', parseFloat(e.target.value) || 0)}
                                                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                                                placeholder="0"
                                                step="0.1"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300 mb-1">Precio Fijo (opcional)</label>
                                            <input
                                                type="number"
                                                value={formData.fixed_price}
                                                onChange={(e) => handleInputChange('fixed_price', e.target.value)}
                                                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                                                placeholder="Precio fijo"
                                                step="0.01"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Resumen de Cálculos */}
                            <div className="bg-gray-900 p-4 rounded-lg">
                                <h5 className="text-md font-semibold text-white mb-3">Resumen del Combo</h5>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-400">Stock Disponible:</span>
                                        <p className="text-white font-bold">{calculateComboStock} unidades</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Componentes:</span>
                                        <p className="text-white font-bold">{selectedComponents.length} items</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Costo Total:</span>
                                        <p className="text-red-300 font-bold">{formatPrice(comboPricing.totalCost)}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">Precio Final:</span>
                                        <p className="text-green-300 font-bold">{formatPrice(comboPricing.finalPrice)}</p>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-gray-400">Margen:</span>
                                        <p className="text-blue-300 font-bold">{comboPricing.margin.toFixed(1)}%</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Columna derecha - Componentes */}
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-lg font-semibold text-white mb-4">Componentes del Combo</h4>
                                
                                {/* Búsqueda de productos */}
                                <div className="mb-4">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => {
                                                setSearchTerm(e.target.value);
                                                setShowProductSearch(e.target.value.length > 2);
                                            }}
                                            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-md text-white"
                                            placeholder="Buscar productos para agregar..."
                                        />
                                        
                                        {showProductSearch && filteredProducts.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto">
                                                {filteredProducts.map((product, index) => (
                                                    <button
                                                        key={index}
                                                        onClick={() => addComponent(product)}
                                                        className="w-full p-3 text-left hover:bg-gray-600 flex justify-between items-center"
                                                    >
                                                        <div>
                                                            <div className="text-white font-medium">{product.sku}</div>
                                                            <div className="text-gray-300 text-sm">{product.name}</div>
                                                            <div className="text-gray-400 text-xs">
                                                                {product.brand} • {product.supplier_name} • 
                                                                Stock: {product.stock_disponible} • 
                                                                <span className="text-green-400">{formatPrice(product.sale_price)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-blue-400 text-xs">
                                                            {product.source === 'inventory' ? 'Inventario' : 'Proveedor'}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Lista de componentes */}
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {selectedComponents.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400">
                                            No hay componentes en este combo
                                        </div>
                                    ) : (
                                        selectedComponents.map((component, index) => (
                                            <div key={index} className="bg-gray-700 p-3 rounded-lg">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="font-medium text-white">{component.product_sku}</div>
                                                        <div className="text-gray-300 text-sm">{component.name}</div>
                                                        <div className="text-gray-400 text-xs">
                                                            {component.brand} • {component.supplier_name}
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => updateComponentQuantity(component.product_sku, component.quantity - 1)}
                                                                className="w-6 h-6 bg-gray-600 text-white rounded flex items-center justify-center hover:bg-gray-500"
                                                            >
                                                                -
                                                            </button>
                                                            <span className="w-12 text-center text-white font-bold">
                                                                {component.quantity}
                                                            </span>
                                                            <button
                                                                onClick={() => updateComponentQuantity(component.product_sku, component.quantity + 1)}
                                                                className="w-6 h-6 bg-gray-600 text-white rounded flex items-center justify-center hover:bg-gray-500"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                        
                                                        <div className="text-right">
                                                            <div className="text-green-400 font-bold text-sm">
                                                                {formatPrice(component.sale_price * component.quantity)}
                                                            </div>
                                                            <div className="text-gray-400 text-xs">
                                                                Stock: {Math.floor(component.stock_disponible / component.quantity)}
                                                            </div>
                                                        </div>
                                                        
                                                        <button
                                                            onClick={() => removeComponent(component.product_sku)}
                                                            className="text-red-400 hover:text-red-300 ml-2"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 border-t border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSubmitting || selectedComponents.length === 0}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditComboModal;