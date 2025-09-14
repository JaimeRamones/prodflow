// Ruta: src/components/SalesView.js
// VERSIÓN CORREGIDA: Sincronización automática, imágenes corregidas, cálculos completos de IVA y costos

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
    
    const ITEMS_PER_PAGE = 50;
    const AUTO_SYNC_INTERVAL = 60000; // 1 minuto

    // Función para obtener imágenes de un item específico desde la API de MercadoLibre
    const fetchItemImages = useCallback(async (itemId) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return [];
            
            const { data, error } = await supabase.functions.invoke('get-meli-item-details', {
                body: { item_id: itemId }
            });
            
            if (error) throw error;
            return data.pictures?.map(pic => pic.secure_url) || [];
        } catch (error) {
            console.error('Error fetching item images:', error);
            return [];
        }
    }, []);

    // Función para enriquecer las órdenes con datos completos
    const enrichOrdersWithCompleteData = useCallback(async (orders) => {
        const enrichedOrders = await Promise.all(
            orders.map(async (order) => {
                let orderTotalCost = 0;
                
                // Enriquecer cada item de la orden
                const enrichedOrderItems = await Promise.all(
                    order.order_items.map(async (item) => {
                        const productInfo = products.find(p => p.sku === item.sku);
                        let costWithVat = 'N/A';
                        let supplierCost = 0;
                        
                        // Calcular costo del producto + IVA
                        if (productInfo && productInfo.cost_price) {
                            supplierCost = productInfo.cost_price * item.quantity;
                            orderTotalCost += supplierCost;
                            costWithVat = (productInfo.cost_price * 1.21).toFixed(2);
                        }
                        
                        // Obtener imágenes de múltiples fuentes
                        let images = [];
                        
                        // 1. Imágenes del producto en nuestra base de datos
                        if (productInfo?.image_urls) {
                            const productImages = productInfo.image_urls
                                .map(url => url ? url.replace(/^http:/, 'https:') : null)
                                .filter(Boolean);
                            images.push(...productImages);
                        }
                        
                        // 2. Thumbnail de la orden (si existe)
                        if (item.thumbnail_url) {
                            const secureThumbnail = item.thumbnail_url.replace(/^http:/, 'https:');
                            if (!images.includes(secureThumbnail)) {
                                images.unshift(secureThumbnail);
                            }
                        }
                        
                        // 3. Intentar obtener imágenes desde la API de ML (si no tenemos suficientes)
                        if (images.length === 0 && item.meli_item_id) {
                            try {
                                const mlImages = await fetchItemImages(item.meli_item_id);
                                images.push(...mlImages);
                            } catch (error) {
                                console.error('Error fetching ML images:', error);
                            }
                        }
                        
                        // 4. Fallback a placeholder si no hay imágenes
                        if (images.length === 0) {
                            images.push('https://via.placeholder.com/150?text=Sin+Imagen');
                        }
                        
                        return {
                            ...item,
                            cost_with_vat: costWithVat,
                            supplier_cost: supplierCost,
                            images: images
                        };
                    })
                );
                
                // Obtener información completa del envío si existe shipping_id
                let shippingCost = order.shipping_cost || 0;
                if (order.shipping_id) {
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (session) {
                            const { data, error } = await supabase.functions.invoke('get-meli-shipment-details', {
                                body: { shipment_id: order.shipping_id }
                            });
                            
                            if (!error && data.cost) {
                                shippingCost = data.cost;
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching shipping details:', error);
                    }
                }
                
                // Calcular totales mejorados
                const totalCostWithVat = orderTotalCost > 0 ? (orderTotalCost * 1.21).toFixed(2) : 0;
                const totalCostWithVatAndShipping = (parseFloat(totalCostWithVat) + shippingCost).toFixed(2);
                
                return {
                    ...order,
                    order_items: enrichedOrderItems,
                    total_cost_with_vat: totalCostWithVat,
                    total_cost_with_vat_and_shipping: totalCostWithVatAndShipping,
                    shipping_cost: shippingCost,
                    supplier_total_cost: orderTotalCost
                };
            })
        );
        
        return enrichedOrders;
    }, [products, fetchItemImages]);

    // Órdenes procesadas con datos completos
    const processedOrders = useMemo(() => {
        if (!salesOrders) return [];
        return salesOrders; // Las órdenes ya están enriquecidas
    }, [salesOrders]);
    
    // Función de sincronización automática mejorada
    const handleAutoSync = useCallback(async () => {
        if (!autoSyncEnabled) return;
        
        try {
            const { data, error } = await supabase.functions.invoke('mercadolibre-sync-orders');
            if (error) throw error;
            
            await fetchSalesOrders();
            setLastSyncTime(new Date());
            
            // Solo mostrar mensaje si es sincronización manual
            if (!autoSyncEnabled) {
                showMessage(data.message || 'Ventas sincronizadas automáticamente.', 'success');
            }
        } catch (err) {
            console.error('Error en sincronización automática:', err);
            // No mostrar error en auto-sync para evitar spam de notificaciones
        }
    }, [autoSyncEnabled, fetchSalesOrders, showMessage]);

    // Configurar sincronización automática
    useEffect(() => {
        let interval;
        
        if (autoSyncEnabled) {
            // Sincronizar inmediatamente al activar
            handleAutoSync();
            
            // Configurar intervalo de sincronización
            interval = setInterval(handleAutoSync, AUTO_SYNC_INTERVAL);
        }
        
        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [autoSyncEnabled, handleAutoSync]);

    // Enriquecer órdenes cuando cambien los datos base
    useEffect(() => {
        if (salesOrders && products.length > 0) {
            enrichOrdersWithCompleteData(salesOrders).then(enrichedOrders => {
                // Aquí podrías actualizar un estado local si necesitas los datos enriquecidos
                setIsLoading(false);
            });
        }
    }, [salesOrders, products, enrichOrdersWithCompleteData]);
    
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

            {/* Filtros y búsqueda */}
            <div className="bg-gray-800 border border-gray-700 p-4 rounded-lg mb-6 space-y-4">
                <input 
                    type="text" 
                    placeholder="Buscar por Nº de Venta, SKU, Comprador o Nº de Envío..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400" 
                />
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <select 
                        value={filters.shippingType} 
                        onChange={e => setFilters({...filters, shippingType: e.target.value})} 
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    >
                        <option value="all">Todos los Envíos</option>
                        <option value="flex">Flex</option>
                        <option value="mercado_envios">Mercado Envíos</option>
                    </select>
                    
                    <select 
                        value={filters.status} 
                        onChange={e => setFilters({...filters, status: e.target.value})} 
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    >
                        <option value="all">Todos los Estados</option>
                        <option value="Recibido">Recibido</option>
                        <option value="Pendiente">Pendiente</option>
                        <option value="En Preparación">En Preparación</option>
                        <option value="daily_dispatch">Envíos del Día</option>
                        <option value="cancelled">Canceladas</option>
                    </select>
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
                                        <div className="flex-shrink-0">
                                            {item.images && item.images[0] && (
                                                <img 
                                                    src={item.images[0]} 
                                                    alt={item.title} 
                                                    className="w-16 h-16 object-cover rounded-md border border-gray-600 cursor-pointer" 
                                                    onClick={() => setZoomedImageUrl(item.images[0])}
                                                    onError={(e) => {
                                                        e.target.src = 'https://via.placeholder.com/150?text=Sin+Imagen';
                                                    }}
                                                />
                                            )}
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