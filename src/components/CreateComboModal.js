import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const CreateComboModal = ({ show, onClose }) => {
    const { showMessage, products, suppliers } = useContext(AppContext);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
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
    const [searchingProducts, setSearchingProducts] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    
    // Debug autenticación
    useEffect(() => {
        if (show) {
            const checkAuth = async () => {
                const { data: { user }, error } = await supabase.auth.getUser();
                console.log('🔍 Debug Auth:');
                console.log('Usuario actual:', user);
                console.log('User ID:', user?.id);
                console.log('Error de auth:', error);
                console.log('Email:', user?.email);
            };
            checkAuth();
        }
    }, [show]);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (!show) {
            setFormData({
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
            setSelectedComponents([]);
            setSearchTerm('');
            setShowProductSearch(false);
            setSearchResults([]);
        }
    }, [show]);

    // Búsqueda inteligente en tiempo real
    useEffect(() => {
        const searchProducts = async () => {
            if (!searchTerm || searchTerm.length < 2) {
                setSearchResults([]);
                setShowProductSearch(false);
                return;
            }

            setSearchingProducts(true);
            setShowProductSearch(true);

            try {
                // Buscar en inventario local
                const inventoryResults = products
                    .filter(product => {
                        if (selectedComponents.some(comp => comp.sku === product.sku)) return false;
                        
                        const searchTermLower = searchTerm.toLowerCase();
                        const searchFields = [
                            product.sku || '',
                            product.name || '',
                            product.brand || '',
                            product.rubro || '',
                            product.subrubro || ''
                        ];
                        
                        return searchFields.some(field => 
                            field.toLowerCase().includes(searchTermLower)
                        );
                    })
                    .map(p => ({
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
                    }))
                    .slice(0, 15);

                // Buscar en supplier_stock_items con query específica
                console.log('Buscando en supplier_stock_items:', searchTerm);
                const { data: supplierData, error } = await supabase
                    .from('supplier_stock_items')
                    .select('*')
                    .ilike('sku', `%${searchTerm}%`)
                    .limit(20)
                    .order('sku');

                if (error) {
                    console.error('Error buscando en proveedores:', error);
                } else {
                    console.log('Resultados de proveedores:', supplierData?.length || 0);
                }

                const supplierResults = (supplierData || [])
                    .filter(item => !selectedComponents.some(comp => comp.sku === item.sku))
                    .map(item => ({
                        sku: item.sku,
                        name: `${item.sku}`,
                        brand: 'Proveedor',
                        cost_price: item.cost_price,
                        sale_price: item.cost_price * 1.3,
                        stock_disponible: item.quantity,
                        supplier_id: null,
                        supplier_name: `Warehouse ${item.warehouse_id}`,
                        source: 'supplier',
                        warehouse_id: item.warehouse_id
                    }));

                // Combinar y ordenar resultados
                const allResults = [...inventoryResults, ...supplierResults]
                    .sort((a, b) => {
                        const aSkuMatch = (a.sku || '').toLowerCase().includes(searchTerm.toLowerCase());
                        const bSkuMatch = (b.sku || '').toLowerCase().includes(searchTerm.toLowerCase());
                        
                        if (aSkuMatch && !bSkuMatch) return -1;
                        if (!aSkuMatch && bSkuMatch) return 1;
                        
                        if (a.source === 'inventory' && b.source === 'supplier') return -1;
                        if (a.source === 'supplier' && b.source === 'inventory') return 1;
                        
                        return 0;
                    })
                    .slice(0, 25);

                setSearchResults(allResults);
                
            } catch (error) {
                console.error('Error en búsqueda:', error);
                setSearchResults([]);
            } finally {
                setSearchingProducts(false);
            }
        };

        const timeoutId = setTimeout(searchProducts, 300);
        return () => clearTimeout(timeoutId);
        
    }, [searchTerm, products, suppliers, selectedComponents]);

    // Manejar cambios en el formulario
    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // Agregar componente al combo
    const addComponent = (product) => {
        const newComponent = {
            sku: product.sku,
            name: product.name,
            brand: product.brand,
            cost_price: product.cost_price,
            sale_price: product.sale_price,
            stock_disponible: product.stock_disponible,
            supplier_id: product.supplier_id,
            supplier_name: product.supplier_name,
            quantity: 1,
            source: product.source
        };
        
        setSelectedComponents(prev => [...prev, newComponent]);
        setSearchTerm('');
        setShowProductSearch(false);
    };

    // Remover componente del combo
    const removeComponent = (sku) => {
        setSelectedComponents(prev => prev.filter(comp => comp.sku !== sku));
    };

    // Actualizar cantidad de un componente
    const updateComponentQuantity = (sku, quantity) => {
        if (quantity < 1) return;
        
        setSelectedComponents(prev => 
            prev.map(comp => 
                comp.sku === sku ? { ...comp, quantity } : comp
            )
        );
    };

    // Agregar ubicación
    const addLocation = (location) => {
        if (location && !formData.locations.includes(location)) {
            handleInputChange('locations', [...formData.locations, location]);
        }
    };

    // Remover ubicación
    const removeLocation = (location) => {
        handleInputChange('locations', formData.locations.filter(loc => loc !== location));
    };

    // Generar SKU automático basado en componentes
    const generateAutoSku = () => {
        if (selectedComponents.length === 0) return '';
        
        const skuParts = selectedComponents.slice(0, 3).map(comp => comp.sku);
        let generatedSku = skuParts.join('+');
        
        if (selectedComponents.length > 3) {
            generatedSku += '+...';
        }
        
        if (generatedSku.length > 50) {
            generatedSku = generatedSku.substring(0, 47) + '...';
        }
        
        return generatedSku;
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

    // Guardar combo
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
            // Verificar que el SKU no exista
            const { data: existingCombo } = await supabase
                .from('garaje_combos')
                .select('id')
                .eq('combo_sku', formData.combo_sku.trim())
                .single();
            
            if (existingCombo) {
                showMessage('Ya existe un combo con ese SKU.', 'error');
                return;
            }

            const brands = [...new Set(selectedComponents.map(comp => comp.brand).filter(Boolean))];
            
            // Crear el combo - ARREGLAR CAMPOS NUMÉRICOS
            const comboData = {
                ...formData,
                combo_sku: formData.combo_sku.trim(),
                brands,
                description: formData.description || generateDescription(),
                meli_description: generateDescription(),
                markup_percentage: formData.markup_percentage || 0,
                fixed_price: formData.fixed_price ? parseFloat(formData.fixed_price) : null
            };
            
            const { data: savedCombo, error: comboError } = await supabase
                .from('garaje_combos')
                .insert(comboData)
                .select()
                .single();
            
            if (comboError) throw comboError;
            
            // Agregar componentes - ARREGLAR CAMPOS NUMÉRICOS
            const componentData = selectedComponents.map(comp => ({
                combo_id: savedCombo.id,
                product_sku: comp.sku,
                quantity: comp.quantity || 1,
                product_name: comp.name || '',
                cost_price: comp.cost_price || 0,
                sale_price: comp.sale_price || 0,
                supplier_id: comp.supplier_id || null,
                supplier_name: comp.supplier_name || ''
            }));
            
            const { error: componentsError } = await supabase
                .from('garaje_combo_items')
                .insert(componentData);
            
            if (componentsError) throw componentsError;
            
            showMessage(`Combo "${formData.combo_name}" creado con éxito.`, 'success');
            onClose();
            
        } catch (error) {
            showMessage(`Error al crear combo: ${error.message}`, 'error');
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

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-700">
                    <h3 className="text-xl font-semibold text-white">Crear Nuevo Combo</h3>
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
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={formData.combo_sku}
                                                onChange={(e) => handleInputChange('combo_sku', e.target.value)}
                                                className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                                                placeholder="Ej: Kit filtros Bosch 31 HAB"
                                            />
                                            <button
                                                onClick={() => handleInputChange('combo_sku', generateAutoSku())}
                                                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                                title="Generar SKU automático"
                                            >
                                                Auto
                                            </button>
                                        </div>
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
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-md text-white"
                                            placeholder="Buscar productos por SKU, nombre o marca..."
                                        />
                                        
                                        {searchingProducts && (
                                            <div className="absolute right-3 top-3">
                                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                                            </div>
                                        )}
                                        
                                        {showProductSearch && searchResults.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto">
                                                {searchResults.map((product, index) => (
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
                                        
                                        {showProductSearch && searchResults.length === 0 && !searchingProducts && searchTerm.length >= 2 && (
                                            <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-lg p-3">
                                                <div className="text-gray-400 text-center">
                                                    No se encontraron productos con "{searchTerm}"
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Lista de componentes seleccionados */}
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {selectedComponents.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400">
                                            Busca y selecciona productos para agregar al combo
                                        </div>
                                    ) : (
                                        selectedComponents.map((component, index) => (
                                            <div key={index} className="bg-gray-700 p-3 rounded-lg">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="font-medium text-white">{component.sku}</div>
                                                        <div className="text-gray-300 text-sm">{component.name}</div>
                                                        <div className="text-gray-400 text-xs">
                                                            {component.brand} • {component.supplier_name}
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => updateComponentQuantity(component.sku, component.quantity - 1)}
                                                                className="w-6 h-6 bg-gray-600 text-white rounded flex items-center justify-center hover:bg-gray-500"
                                                            >
                                                                -
                                                            </button>
                                                            <span className="w-12 text-center text-white font-bold">
                                                                {component.quantity}
                                                            </span>
                                                            <button
                                                                onClick={() => updateComponentQuantity(component.sku, component.quantity + 1)}
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
                                                            onClick={() => removeComponent(component.sku)}
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
                        {isSubmitting ? 'Creando...' : 'Crear Combo'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateComboModal;