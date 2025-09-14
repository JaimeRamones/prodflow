// Ruta: src/components/SalesView.js
// VERSIÓN CORREGIDA: Costos desde supplier_stock_items con mapeo de SKUs mejorado

import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import ImageZoomModal from './ImageZoomModal';

const FlexIcon = () => ( 
    <div className="flex items-center gap-1 bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"></path>
        </svg>
        <span className="text-xs font-bold">FLEX</span>
    </div> 
);

const ShippingIcon = () => ( 
    <div className="flex items-center gap-1 bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"></path>
            <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v5a1 1 0 001 1h2.05a2.5 2.5 0 014.9 0H21a1 1 0 001-1V8a1 1 0 00-1-1h-7z"></path>
        </svg>
        <span className="text-xs font-bold">ENVÍOS</span>
    </div> 
);

const SalesView = () => {
    const { products, showMessage, salesOrders, fetchSalesOrders, fetchSupplierOrders } = useContext(AppContext);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [page, setPage] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrders, setSelectedOrders] = useState(new Set());
    const [filters, setFilters] = useState({ shippingType: 'all', status: 'all' });
    const [zoomedImageUrl, setZoomedImageUrl] = useState(null);
    const [expandedOrders, setExpandedOrders] = useState(new Set());
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
    const [supplierStockItems, setSupplierStockItems] = useState([]);
    
    const ITEMS_PER_PAGE = 50;
    const AUTO_SYNC_INTERVAL = 60000; // 1 minuto

    // Función para normalizar SKUs - remueve espacios extra y normaliza formato
    const normalizeSku = (sku) => {
        if (!sku) return '';
        return sku.toString().trim().replace(/\s+/g, ' ').toUpperCase();
    };

    // Cargar datos de supplier_stock_items para obtener costos del proveedor
    useEffect(() => {
        const fetchSupplierStockItems = async () => {
            try {
                console.log('DEBUG - Iniciando carga de supplier_stock_items...');
                const { data, error } = await supabase
                    .from('supplier_stock_items')
                    .select('sku, cost_price');
                
                if (error) {
                    console.error('DEBUG - Error al cargar supplier_stock_items:', error);
                    throw error;
                }
                console.log('DEBUG - Datos de supplier_stock_items cargados:', data);
                console.log('DEBUG - Cantidad de items:', data?.length || 0);
                
                // Normalizar SKUs y mostrar algunos ejemplos
                const normalizedData = data?.map(item => ({
                    ...item,
                    normalized_sku: normalizeSku(item.sku),
                    original_sku: item.sku
                })) || [];
                
                if (normalizedData.length > 0) {
                    console.log('DEBUG - Primeros 5 SKUs encontrados:');
                    normalizedData.slice(0, 5).forEach(item => {
                        console.log(`  Original: "${item.original_sku}" -> Normalizado: "${item.normalized_sku}" -> Precio: ${item.cost_price}`);
                    });
                }
                
                setSupplierStockItems(normalizedData);
            } catch (error) {
                console.error('Error cargando costos de proveedor:', error);
            }
        };

        fetchSupplierStockItems();
    }, []);

    // Función de sincronización automática
    const handleAutoSync = useCallback(async () => {
        if (!autoSyncEnabled) return;
        
        try {
            const { data, error } = await supabase.functions.invoke('mercadolibre-sync-orders');
            if (error) throw error;
            
            await fetchSalesOrders();
            setLastSyncTime(new Date());
        } catch (err) {
            console.error('Error en sincronización automática:', err);
        }
    }, [autoSyncEnabled, fetchSalesOrders]);

    // Configurar sincronización automática
    useEffect(() => {
        let interval;
        
        if (autoSyncEnabled) {
            handleAutoSync(); // Sincronizar inmediatamente
            interval = setInterval(handleAutoSync, AUTO_SYNC_INTERVAL);
        }
        
        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [autoSyncEnabled, handleAutoSync]);

    // Procesar órdenes con cálculos de costos desde supplier_stock_items
    const processedOrders = useMemo(() => {
        if (!salesOrders) return [];
        
        console.log('DEBUG - Procesando órdenes. Total supplier items:', supplierStockItems.length);
        
        return salesOrders.map(order => {
            let orderTotalCost = 0;
            
            const updatedOrderItems = order.order_items.map(item => {
                const normalizedSaleSku = normalizeSku(item.sku);
                console.log('DEBUG - Procesando item con SKU original:', item.sku);
                console.log('DEBUG - SKU normalizado:', normalizedSaleSku);
                
                // Buscar el producto por SKU para imágenes
                const productInfo = products.find(p => p.sku === item.sku);
                
                // Buscar el costo en supplier_stock_items usando SKU normalizado
                const supplierInfo = supplierStockItems.find(s => s.normalized_sku === normalizedSaleSku);
                console.log('DEBUG - SupplierInfo encontrado para', normalizedSaleSku, ':', supplierInfo);
                
                let costWithVat = 'N/A';
                
                // Calcular costo con IVA si existe en supplier_stock_items
                if (supplierInfo && supplierInfo.cost_price && supplierInfo.cost_price > 0) {
                    const itemTotalCost = supplierInfo.cost_price * item.quantity;
                    orderTotalCost += itemTotalCost;
                    costWithVat = (supplierInfo.cost_price * 1.21).toFixed(2);
                    console.log('DEBUG - Costo calculado para', normalizedSaleSku, ':', costWithVat);
                    console.log('DEBUG - Costo original:', supplierInfo.cost_price, 'x', item.quantity, '=', itemTotalCost);
                } else {
                    console.log('DEBUG - No se encontró costo válido para SKU:', normalizedSaleSku);
                    if (supplierInfo) {
                        console.log('DEBUG - Supplier info existe pero cost_price es:', supplierInfo.cost_price);
                    } else {
                        console.log('DEBUG - No existe registro en supplier_stock_items para:', normalizedSaleSku);
                        // Mostrar los primeros 5 SKUs disponibles para debug
                        if (supplierStockItems.length > 0) {
                            console.log('DEBUG - SKUs disponibles (primeros 5):');
                            supplierStockItems.slice(0, 5).forEach(s => {
                                console.log(`  "${s.normalized_sku}"`);
                            });
                        }
                    }
                }
                
                // Manejar imágenes de forma segura
                let images = [];
                
                // 1. Thumbnail de la orden (más confiable)
                if (item.thumbnail_url) {
                    const secureThumbnail = item.thumbnail_url.replace(/^http:/, 'https:');
                    images.push(secureThumbnail);
                }
                
                // 2. Imágenes del producto en base de datos
                if (productInfo?.image_urls && Array.isArray(productInfo.image_urls)) {
                    const productImages = productInfo.image_urls
                        .filter(url => url && url.trim() !== '')
                        .map(url => url.replace(/^http:/, 'https:'))
                        .filter(url => !images.includes(url)); // Evitar duplicados
                    images.push(...productImages);
                }
                
                return {
                    ...item,
                    cost_with_vat: costWithVat,
                    images: images
                };
            });
            
            // Calcular total con IVA
            const totalCostWithVat = orderTotalCost > 0 ? (orderTotalCost * 1.21).toFixed(2) : 0;
            console.log('DEBUG - Total costo con IVA de la orden:', totalCostWithVat);
            
            return {
                ...order,
                order_items: updatedOrderItems,
                total_cost_with_vat: totalCostWithVat
            };
        });
    }, [salesOrders, products, supplierStockItems]);
    
    const filteredAndSortedOrders = useMemo(() => {
        let filtered = processedOrders;
        
        if (filters.shippingType !== 'all') { 
            filtered = filtered.filter(order => order.shipping_type === filters.shippingType); 
        }
        
        if (filters.status !== 'all') {
            if (filters.status === 'daily_dispatch') { 
                const today = new Date().toISOString().split('T')[0]; 
                filtered = filtered.filter(order => order.created_at.startsWith(today)); 
            } else { 
                filtered = filtered.filter(order => order.status === filters.status); 
            }
        }
        
        if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            filtered = filtered.filter(order =>
                order.meli_order_id?.toString().includes(term) ||
                order.buyer_name?.toLowerCase().includes(term) ||
                order.shipping_id?.toString().includes(term) ||
                order.order_items.some(item =>
                    item.sku?.toLowerCase().includes(term) ||
                    item.title?.toLowerCase().includes(term)
                )
            );
        }
        
        return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }, [processedOrders, searchTerm, filters]);

    const paginatedOrders = useMemo(() => { 
        const from = page * ITEMS_PER_PAGE; 
        const to = from + ITEMS_PER_PAGE; 
        return filteredAndSortedOrders.slice(from, to); 
    }, [filteredAndSortedOrders, page]);
    
    const totalPages = Math.ceil(filteredAndSortedOrders.length / ITEMS_PER_PAGE);
    
    useEffect(() => { 
        if(salesOrders) setIsLoading(false); 
    }, [salesOrders]);
    
    useEffect(() => { 
        setPage(0); 
        setSelectedOrders(new Set()); 
    }, [searchTerm, filters]);
    
    useEffect(() => { 
        setSelectedOrders(new Set()); 
    }, [page]);
    
    const handleSelectOrder = (orderId) => { 
        const newSelection = new Set(selectedOrders); 
        newSelection.has(orderId) ? newSelection.delete(orderId) : newSelection.add(orderId); 
        setSelectedOrders(newSelection); 
    };
    
    const handleSelectAll = (e) => { 
        if (e.target.checked) { 
            setSelectedOrders(new Set(paginatedOrders.map(o => o.id))); 
        } else { 
            setSelectedOrders(new Set()); 
        } 
    };
    
    const handleSyncSales = async () => { 
        setIsSyncing(true); 
        try { 
            const { data, error } = await supabase.functions.invoke('mercadolibre-sync-orders'); 
            if (error) throw error; 
            showMessage(data.message || 'Ventas sincronizadas.', 'success'); 
            await fetchSalesOrders(); 
            setLastSyncTime(new Date());
        } catch (err) { 
            showMessage(`Error al sincronizar ventas: ${err.message}`, 'error'); 
        } finally { 
            setIsSyncing(false); 
        } 
    };
    
    const handleProcessOrder = async (orderId) => { 
        setIsProcessing(orderId); 
        try { 
            const { data, error } = await supabase.functions.invoke('process-mercado-libre-order', { 
                body: { order_id: orderId } 
            }); 
            if (error) throw error; 
            showMessage(data.message, 'success'); 
            await Promise.all([fetchSalesOrders(), fetchSupplierOrders()]); 
        } catch (err) { 
            showMessage(`Error al procesar la orden: ${err.message}`, 'error'); 
        } finally { 
            setIsProcessing(null); 
        } 
    };
    
    const formatDate = (dateString) => { 
        if (!dateString) return 'N/A'; 
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }; 
        return new Date(dateString).toLocaleString('es-AR', options); 
    };
    
    const getStatusChip = (status) => { 
        const statuses = { 
            'Recibido': { text: 'Recibido', color: 'bg-cyan-500/20 text-cyan-300' }, 
            'Pendiente': { text: 'Pendiente', color: 'bg-yellow-500/20 text-yellow-300' }, 
            'En Preparación': { text: 'En Preparación', color: 'bg-blue-500/20 text-blue-300' }, 
            'Preparado': { text: 'Preparado', color: 'bg-indigo-500/20 text-indigo-300' }, 
            'Despachado': { text: 'Despachado', color: 'bg-green-500/20 text-green-300' }, 
        }; 
        const { text, color } = statuses[status] || { text: status, color: 'bg-gray-700 text-gray-300' }; 
        return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${color}`}>{text}</span>; 
    };

    const handlePrintLabels = async (format) => {
        if (selectedOrders.size === 0) { 
            showMessage("Por favor, selecciona al menos una venta.", "info"); 
            return; 
        }
        
        setIsPrinting(true);
        try {
            const shipmentIds = Array.from(selectedOrders)
                .map(id => salesOrders.find(o => o.id === id)?.shipping_id)
                .filter(Boolean);
                
            if (shipmentIds.length === 0) throw new Error("No se encontraron IDs de envío.");
            
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No se pudo obtener la sesión del usuario.");
            
            const functionUrl = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/get-ml-labels`;
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ 
                    shipment_ids: shipmentIds.join(','), 
                    format: format 
                })
            });
            
            if (!response.ok) { 
                const errorData = await response.json(); 
                throw new Error(errorData.error || `Error del servidor: ${response.statusText}`); 
            }
            
            const blob = await response.blob();
            if (blob.size === 0) throw new Error("El archivo recibido está vacío.");
            
            const fileExtension = format === 'zpl' ? 'zip' : 'pdf';
            const fileName = `Etiquetas-MercadoEnvios-${Date.now()}.${fileExtension}`;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (err) {
            showMessage(`Error al generar etiquetas: ${err.message}`, 'error');
        } finally {
            setIsPrinting(false);
        }
    };
    
    const formatCurrency = (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) return '$N/A';
        return `$${new Intl.NumberFormat('es-AR', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        }).format(num)}`;
    };

    const toggleOrderDetails = (orderId) => {
        const newSet = new Set(expandedOrders);
        if (newSet.has(orderId)) {
            newSet.delete(orderId);
        } else {
            newSet.add(orderId);
        }
        setExpandedOrders(newSet);
    };

    const clearAllFilters = () => {
        setFilters({ shippingType: 'all', status: 'all' });
        setSearchTerm('');
    };

    const hasActiveFilters = filters.shippingType !== 'all' || filters.status !== 'all' || searchTerm.trim() !== '';

    return (
        <div>
            {/* Header con controles de sincronización */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-white">Gestión de Ventas</h2>
                
                <div className="flex items-center gap-4">
                    {/* Toggle de sincronización automática */}
                    <div className="flex items-center gap-2">
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoSyncEnabled}
                                onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                                className="sr-only"
                            />
                            <div className={`relative w-10 h-6 transition-colors duration-200 ease-in-out rounded-full ${autoSyncEnabled ? 'bg-teal-600' : 'bg-gray-600'}`}>
                                <span className={`inline-block w-4 h-4 transition-transform duration-200 ease-in-out transform bg-white rounded-full ${autoSyncEnabled ? 'translate-x-5' : 'translate-x-1'} translate-y-1`}></span>
                            </div>
                        </label>
                        <span className="text-sm text-gray-300">
                            Auto-sync {autoSyncEnabled ? 'ON' : 'OFF'}
                        </span>
                    </div>
                    
                    {/* Botón de sincronización manual */}
                    <button 
                        onClick={handleSyncSales} 
                        disabled={isSyncing} 
                        className="flex-shrink-0 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 disabled:bg-gray-600"
                    >
                        {isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
                    </button>
                    
                    {/* Indicador de última sincronización */}
                    {lastSyncTime && (
                        <div className="text-xs text-gray-400">
                            Última sync: {formatDate(lastSyncTime)}
                        </div>
                    )}
                </div>
            </div>

            {/* Filtros mejorados estéticamente */}
            <div className="mb-6 p-6 bg-gradient-to-r from-gray-900/80 to-gray-800/80 rounded-xl border border-gray-700/50 backdrop-blur-sm">
                <div className="space-y-4">
                    {/* Barra de búsqueda mejorada */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg>
                        </div>
                        <input 
                            type="text" 
                            placeholder="Buscar por Nº de Venta, SKU, Comprador o Nº de Envío..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            className="w-full pl-10 pr-10 py-3 bg-gray-800/60 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200" 
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center hover:text-red-400 transition-colors"
                            >
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        )}
                    </div>
                    
                    {/* Filtros en cards separadas */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Filtro de Tipo de Envío */}
                        <div className="group">
                            <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                </svg>
                                <span>Tipo de Envío</span>
                            </label>
                            <select 
                                value={filters.shippingType} 
                                onChange={e => setFilters({...filters, shippingType: e.target.value})} 
                                className="w-full p-3 bg-gray-800/60 border border-gray-600/50 rounded-lg text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                            >
                                <option value="all">🚚 Todos los Envíos</option>
                                <option value="flex">⚡ Flex</option>
                                <option value="mercado_envios">📦 Mercado Envíos</option>
                            </select>
                        </div>
                        
                        {/* Filtro de Estado */}
                        <div className="group">
                            <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                                <svg className="w-4 h-4 text-gray-400 group-hover:text-green-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span>Estado</span>
                            </label>
                            <select 
                                value={filters.status} 
                                onChange={e => setFilters({...filters, status: e.target.value})} 
                                className="w-full p-3 bg-gray-800/60 border border-gray-600/50 rounded-lg text-white focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all duration-200"
                            >
                                <option value="all">📋 Todos los Estados</option>
                                <option value="Recibido">📥 Recibido</option>
                                <option value="Pendiente">⏳ Pendiente</option>
                                <option value="En Preparación">🔧 En Preparación</option>
                                <option value="daily_dispatch">🌅 Envíos del Día</option>
                                <option value="cancelled">❌ Canceladas</option>
                            </select>
                        </div>
                        
                        {/* Botón de limpiar filtros */}
                        <div className="flex items-end">
                            {hasActiveFilters && (
                                <button
                                    onClick={clearAllFilters}
                                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-red-600/80 to-pink-600/80 hover:from-red-600 hover:to-pink-600 text-white font-medium rounded-lg transition-all duration-200 transform hover:scale-105"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                    <span>Limpiar Filtros</span>
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* Indicadores de filtros activos */}
                    {hasActiveFilters && (
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700/50">
                            {searchTerm && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                    🔍 "{searchTerm}"
                                </span>
                            )}
                            {filters.shippingType !== 'all' && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                                    🚚 {filters.shippingType === 'flex' ? 'Flex' : 'Mercado Envíos'}
                                </span>
                            )}
                            {filters.status !== 'all' && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                                    📋 {filters.status}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Controles de selección e impresión */}
            <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center">
                    <input 
                        type="checkbox" 
                        onChange={handleSelectAll} 
                        checked={paginatedOrders.length > 0 && selectedOrders.size === paginatedOrders.length} 
                        className="w-5 h-5 bg-gray-700 border border-gray-600 rounded" 
                    />
                    <label className="ml-2 text-sm text-gray-400">
                        Seleccionar todos en esta página ({selectedOrders.size} seleccionados)
                    </label>
                </div>
                
                <button 
                    onClick={() => handlePrintLabels('pdf')} 
                    disabled={selectedOrders.size === 0 || isPrinting} 
                    className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50"
                >
                    {isPrinting ? 'Imprimiendo...' : 'Imprimir PDF'}
                </button>
                
                <button 
                    onClick={() => handlePrintLabels('zpl')} 
                    disabled={selectedOrders.size === 0 || isPrinting} 
                    className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:opacity-50"
                >
                    {isPrinting ? 'Imprimiendo...' : 'Imprimir ZPL'}
                </button>
            </div>
            
            {/* Lista de órdenes */}
            <div className="space-y-4">
                {isLoading ? ( 
                    <p className="text-center p-8 text-gray-400">Cargando...</p> 
                ) : ( 
                    paginatedOrders.length > 0 ? paginatedOrders.map(order => (
                        <div key={order.id} className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                            {/* Header de la orden */}
                            <div className="p-4 bg-gray-900/50 flex flex-col sm:flex-row justify-between items-start gap-2 border-b border-gray-700">
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedOrders.has(order.id)} 
                                        onChange={() => handleSelectOrder(order.id)} 
                                        className="w-5 h-5 flex-shrink-0 bg-gray-700 border border-gray-600 rounded" 
                                    />
                                    <div>
                                        <p className="text-sm font-semibold text-blue-400">
                                            Venta #{order.meli_order_id}
                                        </p>
                                        <p className="text-lg font-bold text-white">
                                            {order.buyer_name || 'Comprador Desconocido'}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {formatDate(order.created_at)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex-shrink-0 text-right">
                                    <p className="text-xl font-bold text-white">
                                        {formatCurrency(order.total_amount)}
                                    </p>
                                    <div className="flex items-center justify-end gap-2 mt-1">
                                        {order.shipping_type === 'flex' ? <FlexIcon /> : <ShippingIcon />}
                                    </div>
                                </div>
                            </div>
                            
                            {/* Items de la orden */}
                            <div className="p-4">
                                {order.order_items.map((item, index) => (
                                    <div key={item.meli_item_id || index} className="flex items-start gap-4 p-2 mb-2">
                                        {/* Imagen del producto corregida */}
                                        <div className="flex-shrink-0">
                                            {item.images && item.images.length > 0 ? (
                                                <img 
                                                    src={item.images[0]} 
                                                    alt={item.title} 
                                                    className="w-16 h-16 object-cover rounded-md border border-gray-600 cursor-pointer" 
                                                    onClick={() => setZoomedImageUrl(item.images[0])}
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling.style.display = 'flex';
                                                    }}
                                                />
                                            ) : null}
                                            {/* Placeholder cuando no hay imagen */}
                                            <div 
                                                className="w-16 h-16 bg-gray-700 rounded-md border border-gray-600 flex items-center justify-center" 
                                                style={{display: item.images && item.images.length > 0 ? 'none' : 'flex'}}
                                            >
                                                <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        </div>
                                        
                                        <div className="flex-grow">
                                            <p className="font-semibold text-white leading-tight">
                                                {item.title}
                                            </p>
                                            <p className="text-sm text-gray-400 font-mono bg-gray-700 inline-block px-2 py-0.5 rounded mt-1">
                                                SKU: {item.sku || 'N/A'}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0 w-48">
                                            <p className="text-white font-semibold">
                                                {item.quantity} x {formatCurrency(item.unit_price)}
                                            </p>
                                            <p className="text-xs text-yellow-400 mt-1">
                                                Costo c/IVA: {formatCurrency(item.cost_with_vat)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                
                                {/* Desglose detallado (plegable) */}
                                {expandedOrders.has(order.id) && (
                                    <div className="border-t border-gray-700 mt-2 pt-2">
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                            <span className="text-gray-400">Cobro total de la venta:</span>
                                            <span className="text-white text-right font-mono">{formatCurrency(order.total_amount)}</span>
                                            
                                            <span className="text-gray-400">Costo de tu envío:</span>
                                            <span className="text-white text-right font-mono">{formatCurrency(order.shipping_cost)}</span>
                                            
                                            <span className="text-red-400">Cargo por Venta:</span>
                                            <span className="text-red-400 text-right font-mono">- {formatCurrency(order.sale_fee)}</span>
                                            
                                            <span className="text-red-400">Impuestos y percepciones:</span>
                                            <span className="text-red-400 text-right font-mono">- {formatCurrency(order.taxes_amount)}</span>
                                            
                                            <span className="text-green-400 font-bold border-t border-gray-600 mt-1 pt-1">Recibes:</span>
                                            <span className="text-green-400 text-right font-bold font-mono border-t border-gray-600 mt-1 pt-1">{formatCurrency(order.net_received_amount)}</span>
                                            
                                            <span className="text-yellow-400 font-bold">Costo Total Productos c/IVA:</span>
                                            <span className="text-yellow-400 text-right font-bold font-mono">{formatCurrency(order.total_cost_with_vat)}</span>
                                            
                                            <span className="text-cyan-300 font-bold text-lg border-t-2 border-cyan-700 mt-1 pt-1">Ganancia:</span>
                                            <span className="text-cyan-300 text-right font-bold font-mono text-lg border-t-2 border-cyan-700 mt-1 pt-1">{formatCurrency(order.net_received_amount - order.total_cost_with_vat)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Footer con acciones */}
                            <div className="p-4 bg-gray-800 border-t border-gray-700 flex justify-between items-center">
                                <div>
                                    {getStatusChip(order.status)}
                                    <button 
                                        onClick={() => toggleOrderDetails(order.id)} 
                                        className="ml-4 px-3 py-1 text-xs text-gray-300 bg-gray-700 rounded-full hover:bg-gray-600"
                                    >
                                        {expandedOrders.has(order.id) ? 'Ocultar Detalle' : 'Ver Detalle'}
                                    </button>
                                </div>
                                {order.status === 'Recibido' && (
                                    <button 
                                        onClick={() => handleProcessOrder(order.id)} 
                                        disabled={isProcessing === order.id} 
                                        className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600"
                                    >
                                        {isProcessing === order.id ? 'Procesando...' : 'Procesar Pedido'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )) : ( 
                        <div className="text-center py-12 px-6 bg-gray-800 border border-gray-700 rounded-lg">
                            <h3 className="mt-2 text-lg font-medium text-white">No se encontraron ventas</h3>
                            <p className="mt-1 text-sm text-gray-400">
                                Prueba a sincronizar o ajusta tu búsqueda y filtros.
                            </p>
                        </div>
                    )
                )}
            </div>
            
            {/* Paginación */}
            <div className="flex justify-between items-center p-4 mt-4 bg-gray-800 rounded-lg border border-gray-700">
                <button 
                    onClick={() => setPage(p => Math.max(0, p - 1))} 
                    disabled={page === 0 || isLoading} 
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg disabled:opacity-50"
                >
                    Anterior
                </button>
                <span className="text-gray-400">
                    Página {page + 1} de {totalPages > 0 ? totalPages : 1}
                </span>
                <button 
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} 
                    disabled={page >= totalPages - 1 || isLoading} 
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg disabled:opacity-50"
                >
                    Siguiente
                </button>
            </div>
            
            {/* Modal de imagen */}
            <ImageZoomModal 
                imageUrl={zoomedImageUrl} 
                onClose={() => setZoomedImageUrl(null)} 
            />
        </div>
    );
};

export default SalesView;