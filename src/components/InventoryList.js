import React, { useState, useContext, useMemo, useCallback, useEffect } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import ExcelImportExport from './ExcelImportExport';

const InventoryList = ({ onEdit, onDelete, onPublish }) => {
    const { products, showMessage, suppliers } = useContext(AppContext);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [showImportExportModal, setShowImportExportModal] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'movement_score', direction: 'desc' });
    const [selectedColumns, setSelectedColumns] = useState({
        sku: true,
        name: true,
        brand: true,
        cost_price: true,
        sale_price: true,
        stock_disponible: true,
        stock_reservado: false,
        stock_total: true,
        supplier: false,
        movement_indicator: true,
        alternatives: true,
        oem_numbers: false
    });
    const [viewMode, setViewMode] = useState('smart');
    const [showColumnConfig, setShowColumnConfig] = useState(false);
    const [salesData, setSalesData] = useState([]);
    const [isLoadingSales, setIsLoadingSales] = useState(false);
    const [scoringPeriod, setScoringPeriod] = useState(30); // días
    const [productReferences, setProductReferences] = useState([]);
    const [productEquivalents, setProductEquivalents] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    
    const productsPerPage = 50;

    // Cargar referencias y equivalencias
    useEffect(() => {
        const loadProductData = async () => {
            try {
                // Cargar referencias OEM
                const { data: references, error: refError } = await supabase
                    .from('product_references')
                    .select('*');
                
                if (!refError && references) {
                    setProductReferences(references);
                }

                // Cargar equivalencias
                const { data: equivalents, error: equivError } = await supabase
                    .from('product_equivalents')
                    .select(`
                        *,
                        main_product:products!main_product_id(id, sku, name, brand),
                        equivalent_product:products!equivalent_product_id(id, sku, name, brand, stock_disponible)
                    `);
                
                if (!equivError && equivalents) {
                    setProductEquivalents(equivalents);
                }
            } catch (error) {
                console.error('Error cargando datos de productos:', error);
            }
        };

        loadProductData();
    }, []);

    // Cargar datos de ventas con período configurable
    useEffect(() => {
        const loadSalesData = async () => {
            setIsLoadingSales(true);
            try {
                const startDate = new Date(Date.now() - scoringPeriod * 24 * 60 * 60 * 1000).toISOString();
                const { data, error } = await supabase
                    .from('order_items')
                    .select('sku, quantity, created_at, unit_price')
                    .gte('created_at', startDate)
                    .order('created_at', { ascending: false });
                
                if (!error && data) {
                    setSalesData(data);
                }
            } catch (error) {
                console.error('Error cargando datos de ventas:', error);
            } finally {
                setIsLoadingSales(false);
            }
        };

        if (viewMode === 'smart') {
            loadSalesData();
        }
    }, [viewMode, scoringPeriod]);

    // Calcular scoring inteligente con múltiples períodos
    const calculateProductScore = useCallback((product) => {
        if (!salesData.length) return { total: 0, recent: 0, frequency: 0, revenue: 0 };
        
        const productSales = salesData.filter(sale => sale.sku === product.sku);
        if (productSales.length === 0) return { total: 0, recent: 0, frequency: 0, revenue: 0 };

        const now = Date.now();
        const totalQuantity = productSales.reduce((sum, sale) => sum + (sale.quantity || 0), 0);
        const totalRevenue = productSales.reduce((sum, sale) => sum + ((sale.quantity || 0) * (sale.unit_price || 0)), 0);
        
        // Ventas por período
        const periods = {
            week: now - 7 * 24 * 60 * 60 * 1000,
            month: now - 30 * 24 * 60 * 60 * 1000,
            quarter: now - 90 * 24 * 60 * 60 * 1000
        };

        const recentSales = {
            week: productSales.filter(sale => new Date(sale.created_at) > new Date(periods.week)).length,
            month: productSales.filter(sale => new Date(sale.created_at) > new Date(periods.month)).length,
            quarter: productSales.filter(sale => new Date(sale.created_at) > new Date(periods.quarter)).length
        };

        const frequency = productSales.length;
        const stockFactor = (product.stock_disponible || 0) > 0 ? 1.2 : 0.5;
        
        // Score compuesto
        const totalScore = Math.round(
            (totalQuantity * 0.3 + 
             frequency * 0.3 + 
             recentSales.week * 2 + 
             recentSales.month * 1.5 + 
             (totalRevenue / 1000) * 0.2) * stockFactor
        );

        return {
            total: totalScore,
            recent: recentSales.week,
            frequency,
            revenue: totalRevenue,
            periods: recentSales
        };
    }, [salesData]);

    // Búsqueda avanzada multi-criterio para autopartes
    const advancedAutomotiveSearch = useCallback((products, searchTerm) => {
        if (!searchTerm.trim()) return products;
        
        const normalizedSearch = searchTerm.toLowerCase().trim();
        const searchTerms = normalizedSearch.split(/\s+/).filter(t => t.length > 0);
        
        return products.filter(product => {
            // 1. Búsqueda exacta en SKU (sin normalización, respetando espacios)
            const skuMatch = product.sku && product.sku.toLowerCase().includes(normalizedSearch);
            
            // 2. Búsqueda por fragmentos de SKU (5PK debe encontrar 5PK868)
            const skuFragmentMatch = searchTerms.some(term => 
                product.sku && product.sku.toLowerCase().includes(term)
            );
            
            // 3. Búsqueda en nombre del producto
            const nameMatch = searchTerms.every(term => 
                product.name && product.name.toLowerCase().includes(term)
            );
            
            // 4. Búsqueda por marca
            const brandMatch = product.brand && product.brand.toLowerCase().includes(normalizedSearch);
            
            // 5. Búsqueda por números OEM (si existen)
            const oemMatch = product.oem_numbers && Array.isArray(product.oem_numbers) && 
                product.oem_numbers.some(oem => oem.toLowerCase().includes(normalizedSearch));
            
            // 6. Búsqueda por referencias cruzadas
            const crossRefMatch = product.cross_references && Array.isArray(product.cross_references) && 
                product.cross_references.some(ref => ref.toLowerCase().includes(normalizedSearch));
            
            // 7. Búsqueda en referencias externas (tabla product_references)
            const externalRefMatch = productReferences.some(ref => 
                ref.product_id === product.id && 
                ref.reference_number && 
                ref.reference_number.toLowerCase().includes(normalizedSearch)
            );
            
            return skuMatch || skuFragmentMatch || nameMatch || brandMatch || oemMatch || crossRefMatch || externalRefMatch;
        });
    }, [productReferences]);

    // Obtener alternativas de un producto
    const getProductAlternatives = useCallback((product) => {
        return productEquivalents
            .filter(equiv => equiv.main_product_id === product.id)
            .map(equiv => equiv.equivalent_product)
            .filter(Boolean);
    }, [productEquivalents]);

    // Productos procesados con scoring y alternativas
    const processedProducts = useMemo(() => {
        return products.map(product => {
            const scoring = calculateProductScore(product);
            const alternatives = getProductAlternatives(product);
            const supplier = suppliers?.find(s => s.id === product.supplier_id);
            
            // Obtener referencias OEM para este producto
            const oemRefs = productReferences
                .filter(ref => ref.product_id === product.id && ref.reference_type === 'oem')
                .map(ref => ref.reference_number);

            return {
                ...product,
                movement_score: scoring.total,
                scoring_details: scoring,
                supplier_name: supplier?.name || 'N/A',
                alternatives_count: alternatives.length,
                alternatives: alternatives,
                oem_references: oemRefs,
                has_alternatives: alternatives.length > 0,
                alternatives_in_stock: alternatives.filter(alt => (alt.stock_disponible || 0) > 0).length
            };
        });
    }, [products, calculateProductScore, getProductAlternatives, suppliers, productReferences]);

    // Filtrado y ordenamiento
    const filteredAndSortedProducts = useMemo(() => {
        let filtered = advancedAutomotiveSearch(processedProducts, searchTerm);
        
        // Ordenamiento inteligente
        if (sortConfig.key) {
            filtered.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];
                
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
                }
                
                aValue = String(aValue || '').toLowerCase();
                bValue = String(bValue || '').toLowerCase();
                
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        
        return filtered;
    }, [processedProducts, searchTerm, sortConfig, advancedAutomotiveSearch]);

    const indexOfLastProduct = currentPage * productsPerPage;
    const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
    const currentProducts = filteredAndSortedProducts.slice(indexOfFirstProduct, indexOfLastProduct);
    const totalPages = Math.ceil(filteredAndSortedProducts.length / productsPerPage);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const handlePaginate = (pageNumber) => {
        if (pageNumber < 1 || pageNumber > totalPages) return;
        setCurrentPage(pageNumber);
    };
    
    const formatCurrency = (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) return '$0,00';
        return new Intl.NumberFormat('es-AR', { 
            style: 'currency', 
            currency: 'ARS',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    };

    const getMovementIndicator = (score) => {
        if (score >= 100) return { icon: '🚀', color: 'text-purple-400', label: 'Súper Vendedor' };
        if (score >= 50) return { icon: '🔥', color: 'text-red-400', label: 'Top Seller' };
        if (score >= 20) return { icon: '📈', color: 'text-orange-400', label: 'Vendedor' };
        if (score >= 5) return { icon: '📊', color: 'text-blue-400', label: 'Moderado' };
        return { icon: '❄️', color: 'text-gray-400', label: 'Bajo Movimiento' };
    };

    const getStockStatus = (available, reserved) => {
        if (available <= 0) return { color: 'bg-red-500', label: 'Sin Stock', priority: 'high' };
        if (available <= 3) return { color: 'bg-orange-500', label: 'Crítico', priority: 'high' };
        if (available <= 10) return { color: 'bg-yellow-500', label: 'Bajo', priority: 'medium' };
        return { color: 'bg-green-500', label: 'OK', priority: 'low' };
    };

    const getPricingStatus = (product) => {
        if (!product.cost_price || product.cost_price <= 0) {
            return { 
                icon: '⚠️', 
                color: 'text-red-400', 
                label: 'Sin precio de proveedor', 
                severity: 'error' 
            };
        }
        if (!product.sale_price || product.sale_price <= 0) {
            return { 
                icon: '📋', 
                color: 'text-orange-400', 
                label: 'Sin precio de venta calculado', 
                severity: 'warning' 
            };
        }
        return { 
            icon: '✅', 
            color: 'text-green-400', 
            label: 'Precios OK', 
            severity: 'ok' 
        };
    };

    // Función para sincronizar precios de un producto
    const handleSyncPrices = async (productId) => {
        try {
            const { data, error } = await supabase.rpc('apply_product_pricing', { 
                product_id_param: productId 
            });
            
            if (error) throw error;
            
            showMessage(`Precio sincronizado correctamente`, 'success');
            // Recargar productos después de sincronizar
            window.location.reload();
        } catch (error) {
            showMessage(`Error sincronizando precio: ${error.message}`, 'error');
        }
    };

    // Función para sincronizar todos los precios
    const handleSyncAllPrices = async () => {
        setIsLoadingSales(true);
        try {
            const { data, error } = await supabase.rpc('apply_product_pricing');
            
            if (error) throw error;
            
            showMessage(`${data} productos actualizados con precios de proveedores`, 'success');
            // Recargar productos después de sincronizar
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (error) {
            showMessage(`Error sincronizando precios: ${error.message}`, 'error');
        } finally {
            setIsLoadingSales(false);
        }
    };

    const getAlternativesIndicator = (product) => {
        if (!product.has_alternatives) return null;
        
        if (product.alternatives_in_stock > 0) {
            return {
                icon: '✅',
                color: 'text-green-400',
                label: `${product.alternatives_in_stock} alternativas con stock`
            };
        } else {
            return {
                icon: '⚠️',
                color: 'text-yellow-400',
                label: `${product.alternatives_count} alternativas sin stock`
            };
        }
    };

    // Configuraciones de columnas disponibles
    const availableColumns = [
        { key: 'sku', label: 'SKU', sortable: true, required: true },
        { key: 'name', label: 'Nombre', sortable: true, required: true },
        { key: 'brand', label: 'Marca', sortable: true, required: false },
        { key: 'supplier', label: 'Proveedor', sortable: true, required: false },
        { key: 'cost_price', label: 'Costo', sortable: true, required: false },
        { key: 'sale_price', label: 'Venta', sortable: true, required: true },
        { key: 'stock_disponible', label: 'Disp.', sortable: true, required: true },
        { key: 'stock_reservado', label: 'Res.', sortable: true, required: false },
        { key: 'stock_total', label: 'Total', sortable: true, required: false },
        { key: 'movement_indicator', label: 'Mov.', sortable: true, required: false },
        { key: 'alternatives', label: 'Alt.', sortable: false, required: false },
        { key: 'oem_numbers', label: 'OEM', sortable: false, required: false }
    ];

    const SortableHeader = ({ column, children }) => (
        <th 
            scope="col" 
            className={`px-3 py-3 cursor-pointer hover:bg-gray-600 transition-colors text-xs ${
                column.sortable ? 'select-none' : ''
            }`}
            onClick={() => column.sortable && handleSort(column.key)}
        >
            <div className="flex items-center gap-1">
                {children}
                {column.sortable && (
                    <div className="flex flex-col">
                        <svg 
                            className={`w-2 h-2 ${
                                sortConfig.key === column.key && sortConfig.direction === 'asc' 
                                    ? 'text-blue-400' 
                                    : 'text-gray-500'
                            }`} 
                            fill="currentColor" 
                            viewBox="0 0 20 20"
                        >
                            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        <svg 
                            className={`w-2 h-2 ${
                                sortConfig.key === column.key && sortConfig.direction === 'desc' 
                                    ? 'text-blue-400' 
                                    : 'text-gray-500'
                            }`} 
                            fill="currentColor" 
                            viewBox="0 0 20 20"
                        >
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </div>
                )}
            </div>
        </th>
    );

    return (
        <div>
            {/* Header mejorado */}
            <div className="flex flex-col xl:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-3xl font-bold text-white">Inventario AutoPartes Pro</h2>
                    {isLoadingSales && (
                        <div className="flex items-center gap-2 text-blue-400 text-sm">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent"></div>
                            Analizando {scoringPeriod} días...
                        </div>
                    )}
                </div>

                {/* Controles superiores */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Botón sincronizar precios */}
                    <button
                        onClick={handleSyncAllPrices}
                        disabled={isLoadingSales}
                        className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                        title="Sincronizar todos los precios desde proveedores"
                    >
                        {isLoadingSales ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h4"></path>
                            </svg>
                        )}
                        Sync Precios
                    </button>

                    {/* Período de scoring */}
                    <select
                        value={scoringPeriod}
                        onChange={(e) => setScoringPeriod(parseInt(e.target.value))}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                        title="Período para calcular movimiento"
                    >
                        <option value={7}>Última semana</option>
                        <option value={15}>Últimos 15 días</option>
                        <option value={30}>Último mes</option>
                        <option value={60}>Últimos 2 meses</option>
                        <option value={90}>Últimos 3 meses</option>
                    </select>

                    {/* Selector de vista */}
                    <select
                        value={viewMode}
                        onChange={(e) => setViewMode(e.target.value)}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                    >
                        <option value="smart">Vista Inteligente</option>
                        <option value="compact">Vista Compacta</option>
                        <option value="detailed">Vista Detallada</option>
                    </select>

                    {/* Configurar columnas */}
                    <button
                        onClick={() => setShowColumnConfig(true)}
                        className="px-3 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-2"
                        title="Configurar columnas"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
                        </svg>
                        Columnas
                    </button>

                    {/* Importar/Exportar */}
                    <button
                        onClick={() => setShowImportExportModal(true)}
                        className="px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12l3 3m0 0l3-3m-3 3V9"></path>
                        </svg>
                        I/E
                    </button>
                </div>
            </div>

            {/* Barra de búsqueda avanzada para autopartes */}
            <div className="mb-6 bg-gray-800 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Búsqueda AutoPartes: SKU, fragmento (5PK), marca, OEM, nombre, equivalencias..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="block w-full pl-10 pr-4 py-3 text-sm border rounded-lg bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {searchTerm && (
                            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                <button
                                    onClick={() => {setSearchTerm(''); setCurrentPage(1);}}
                                    className="text-gray-400 hover:text-white"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {/* Estadísticas de búsqueda */}
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400">{filteredAndSortedProducts.length} productos</span>
                            <span className="text-gray-600">|</span>
                            <span className="text-blue-400">Pág {currentPage}/{totalPages}</span>
                        </div>
                        
                        {searchTerm && (
                            <div className="flex items-center gap-2 text-green-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span>{filteredAndSortedProducts.length} coincidencias</span>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Tips de búsqueda */}
                <div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-4">
                    <span>💡 Tips: "5PK" (fragmento), "AIMET" (marca), "12345" (OEM)</span>
                    <span>🔍 Busca en: SKU, nombre, marca, números originales, equivalencias</span>
                </div>
            </div>

            {/* Tabla mejorada para autopartes */}
            <div className="relative overflow-x-auto shadow-md sm:rounded-lg bg-gray-800">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                        <tr>
                            {selectedColumns.sku && (
                                <SortableHeader column={{ key: 'sku', sortable: true }}>
                                    <span className="font-mono">SKU</span>
                                </SortableHeader>
                            )}
                            {selectedColumns.name && (
                                <SortableHeader column={{ key: 'name', sortable: true }}>
                                    Nombre
                                </SortableHeader>
                            )}
                            {selectedColumns.brand && (
                                <SortableHeader column={{ key: 'brand', sortable: true }}>
                                    Marca
                                </SortableHeader>
                            )}
                            {selectedColumns.supplier && (
                                <SortableHeader column={{ key: 'supplier_name', sortable: true }}>
                                    Proveedor
                                </SortableHeader>
                            )}
                            {selectedColumns.cost_price && (
                                <SortableHeader column={{ key: 'cost_price', sortable: true }}>
                                    <div className="text-right">Costo</div>
                                </SortableHeader>
                            )}
                            {selectedColumns.sale_price && (
                                <SortableHeader column={{ key: 'sale_price', sortable: true }}>
                                    <div className="text-right">Venta</div>
                                </SortableHeader>
                            )}
                            {selectedColumns.stock_disponible && (
                                <SortableHeader column={{ key: 'stock_disponible', sortable: true }}>
                                    <div className="text-center">Disp.</div>
                                </SortableHeader>
                            )}
                            {selectedColumns.stock_reservado && (
                                <SortableHeader column={{ key: 'stock_reservado', sortable: true }}>
                                    <div className="text-center">Res.</div>
                                </SortableHeader>
                            )}
                            {selectedColumns.stock_total && (
                                <SortableHeader column={{ key: 'stock_total', sortable: true }}>
                                    <div className="text-center">Total</div>
                                </SortableHeader>
                            )}
                            {selectedColumns.movement_indicator && (
                                <SortableHeader column={{ key: 'movement_score', sortable: true }}>
                                    <div className="text-center">Mov.</div>
                                </SortableHeader>
                            )}
                            {selectedColumns.alternatives && (
                                <th scope="col" className="px-3 py-3 text-center text-xs">
                                    Alt.
                                </th>
                            )}
                            {selectedColumns.oem_numbers && (
                                <th scope="col" className="px-3 py-3 text-xs">
                                    OEM
                                </th>
                            )}
                            <th scope="col" className="px-3 py-3 text-center text-xs">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentProducts.map((product, index) => {
                            const stockStatus = getStockStatus(product.stock_disponible, product.stock_reservado);
                            const movementIndicator = getMovementIndicator(product.movement_score);
                            const alternativesIndicator = getAlternativesIndicator(product);
                            
                            return (
                                <tr key={product.id} className={`border-b border-gray-700 hover:bg-gray-700/50 transition-colors ${
                                    index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-850'
                                }`}>
                                    {selectedColumns.sku && (
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-6 rounded-full ${stockStatus.color}`} title={stockStatus.label}></div>
                                                <span className="font-mono text-white font-medium text-sm">{product.sku}</span>
                                                {/* Indicador de problemas de precios */}
                                                {(() => {
                                                    const pricingStatus = getPricingStatus(product);
                                                    if (pricingStatus.severity === 'error') {
                                                        return (
                                                            <span 
                                                                className="text-red-400 cursor-help" 
                                                                title={pricingStatus.label}
                                                            >
                                                                {pricingStatus.icon}
                                                            </span>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        </td>
                                    )}
                                    {selectedColumns.name && (
                                        <td className="px-3 py-2">
                                            <div className="max-w-xs truncate text-sm" title={product.name}>
                                                {product.name}
                                            </div>
                                        </td>
                                    )}
                                    {selectedColumns.brand && (
                                        <td className="px-3 py-2">
                                            <span className="inline-block px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">
                                                {product.brand || 'N/A'}
                                            </span>
                                        </td>
                                    )}
                                    {selectedColumns.supplier && (
                                        <td className="px-3 py-2 text-xs text-gray-400">
                                            {product.supplier_name}
                                        </td>
                                    )}
                                    {selectedColumns.cost_price && (
                                        <td className="px-3 py-2 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <span className={`font-mono text-sm ${
                                                    (!product.cost_price || product.cost_price <= 0) 
                                                        ? 'text-red-400' 
                                                        : 'text-gray-300'
                                                }`}>
                                                    {formatCurrency(product.cost_price)}
                                                </span>
                                                {(!product.cost_price || product.cost_price <= 0) && (
                                                    <button
                                                        onClick={() => handleSyncPrices(product.id)}
                                                        className="p-1 text-yellow-400 hover:text-white hover:bg-yellow-500 rounded text-xs transition-colors"
                                                        title="Sincronizar precio desde proveedor"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                    {selectedColumns.sale_price && (
                                        <td className="px-3 py-2 text-right font-mono text-white font-semibold text-sm">
                                            {formatCurrency(product.sale_price)}
                                        </td>
                                    )}
                                    {selectedColumns.stock_disponible && (
                                        <td className="px-3 py-2 text-center">
                                            <span className={`font-bold text-sm ${
                                                (product.stock_disponible || 0) > 0 ? 'text-green-400' : 'text-red-400'
                                            }`}>
                                                {product.stock_disponible || 0}
                                            </span>
                                        </td>
                                    )}
                                    {selectedColumns.stock_reservado && (
                                        <td className="px-3 py-2 text-center text-yellow-400 font-semibold text-sm">
                                            {product.stock_reservado || 0}
                                        </td>
                                    )}
                                    {selectedColumns.stock_total && (
                                        <td className="px-3 py-2 text-center font-semibold text-sm">
                                            {product.stock_total || 0}
                                        </td>
                                    )}
                                    {selectedColumns.movement_indicator && (
                                        <td className="px-3 py-2 text-center">
                                            <div 
                                                className="flex items-center justify-center gap-1 cursor-help" 
                                                title={`${movementIndicator.label} - Score: ${product.movement_score}\nÚltimos 7d: ${product.scoring_details?.periods?.week || 0}\nFrecuencia: ${product.scoring_details?.frequency || 0}\nIngresos: ${formatCurrency(product.scoring_details?.revenue || 0)}`}
                                            >
                                                <span className="text-base">{movementIndicator.icon}</span>
                                                <span className={`text-xs font-semibold ${movementIndicator.color}`}>
                                                    {product.movement_score}
                                                </span>
                                            </div>
                                        </td>
                                    )}
                                    {selectedColumns.alternatives && (
                                        <td className="px-3 py-2 text-center">
                                            {alternativesIndicator && (
                                                <div 
                                                    className="cursor-help" 
                                                    title={alternativesIndicator.label}
                                                >
                                                    <span className="text-base">{alternativesIndicator.icon}</span>
                                                    <span className={`text-xs font-semibold ml-1 ${alternativesIndicator.color}`}>
                                                        {product.alternatives_count}
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                    )}
                                    {selectedColumns.oem_numbers && (
                                        <td className="px-3 py-2">
                                            {product.oem_references && product.oem_references.length > 0 && (
                                                <div className="text-xs text-blue-300 font-mono">
                                                    {product.oem_references.slice(0, 2).join(', ')}
                                                    {product.oem_references.length > 2 && '...'}
                                                </div>
                                            )}
                                        </td>
                                    )}
                                    <td className="px-3 py-2">
                                        <div className="flex justify-center items-center gap-1">
                                            <button 
                                                onClick={() => onPublish(product)} 
                                                title="Publicar en ML" 
                                                className="p-1 text-yellow-400 hover:text-white hover:bg-yellow-500 rounded-md transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                                </svg>
                                            </button>
                                            <button 
                                                onClick={() => onEdit(product)} 
                                                title="Editar" 
                                                className="p-1 text-blue-400 hover:text-white hover:bg-blue-500 rounded-md transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path>
                                                </svg>
                                            </button>
                                            <button 
                                                onClick={() => onDelete(product)} 
                                                title="Eliminar" 
                                                className="p-1 text-red-400 hover:text-white hover:bg-red-500 rounded-md transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Paginación mejorada */}
            <nav className="flex items-center justify-between pt-6" aria-label="Table navigation">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-normal text-gray-400">
                        Mostrando <span className="font-semibold text-white">{indexOfFirstProduct + 1}-{Math.min(indexOfLastProduct, filteredAndSortedProducts.length)}</span> de <span className="font-semibold text-white">{filteredAndSortedProducts.length}</span>
                    </span>
                    
                    {/* Salto rápido de páginas */}
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-400">Ir a:</label>
                        <input
                            type="number"
                            min="1"
                            max={totalPages}
                            value={currentPage}
                            onChange={(e) => {
                                const page = parseInt(e.target.value);
                                if (page >= 1 && page <= totalPages) {
                                    setCurrentPage(page);
                                }
                            }}
                            className="w-16 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white text-center"
                        />
                        <span className="text-xs text-gray-400">de {totalPages}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => handlePaginate(1)} 
                        disabled={currentPage === 1}
                        className="px-3 py-2 text-sm border rounded-lg bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Primera
                    </button>
                    <button 
                        onClick={() => handlePaginate(currentPage - 1)} 
                        disabled={currentPage === 1}
                        className="px-3 py-2 text-sm border rounded-lg bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        ‹ Anterior
                    </button>
                    <button 
                        onClick={() => handlePaginate(currentPage + 1)} 
                        disabled={currentPage === totalPages}
                        className="px-3 py-2 text-sm border rounded-lg bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Siguiente ›
                    </button>
                    <button 
                        onClick={() => handlePaginate(totalPages)} 
                        disabled={currentPage === totalPages}
                        className="px-3 py-2 text-sm border rounded-lg bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Última
                    </button>
                </div>
            </nav>

            {/* Modal de configuración de columnas */}
            {showColumnConfig && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-white mb-4">Configurar Columnas</h3>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {availableColumns.map(column => (
                                    <label key={column.key} className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedColumns[column.key]}
                                            onChange={(e) => setSelectedColumns(prev => ({
                                                ...prev,
                                                [column.key]: e.target.checked
                                            }))}
                                            disabled={column.required}
                                            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                                        />
                                        <span className={`text-sm ${selectedColumns[column.key] ? 'text-white' : 'text-gray-400'} ${column.required ? 'font-semibold' : ''}`}>
                                            {column.label} {column.required && '(Requerido)'}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setShowColumnConfig(false)}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Importar/Exportar */}
            {showImportExportModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white">Importar/Exportar Inventario</h3>
                            <button
                                onClick={() => setShowImportExportModal(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="p-4">
                            <ExcelImportExport />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryList;