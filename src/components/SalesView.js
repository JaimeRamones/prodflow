// src/components/SalesView.js

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import ImageZoomModal from './ImageZoomModal';

// Iconos
const FlexIcon = () => ( /* ... (Icono se mantiene igual) ... */ );
const ShippingIcon = () => ( /* ... (Icono se mantiene igual) ... */ );

const SalesView = () => {
    // Definiciones de estado y contexto (¡Esto arregla el error de Vercel!)
    const { products, showMessage, salesOrders, fetchSalesOrders, fetchSupplierOrders, fetchProducts } = useContext(AppContext);
    const [isLoading, setIsLoading] = useState(true); const [isSyncing, setIsSyncing] = useState(false); const [isProcessing, setIsProcessing] = useState(null); const [isPrinting, setIsPrinting] = useState(false); const [page, setPage] = useState(0); const [searchTerm, setSearchTerm] = useState(''); const [selectedOrders, setSelectedOrders] = useState(new Set());
    const [filters, setFilters] = useState({ shippingType: 'all', status: 'all', printStatus: 'all' });
    const [zoomedImageUrl, setZoomedImageUrl] = useState(null); const ITEMS_PER_PAGE = 50;

    // Lógica de Filtrado (Se mantiene igual que la versión optimizada anterior)
    const processedOrders = useMemo(() => {
        if (!salesOrders) return [];

        // 1. Enriquecimiento
        const enriched = salesOrders.map(order => ({
            ...order,
            order_items: order.order_items.map(item => {
                const productInfo = products.find(p => p.sku === item.sku);
                const costWithVat = productInfo?.cost_price ? (productInfo.cost_price * 1.21).toFixed(2) : 'N/A';
                const secureThumbnail = item.thumbnail_url ? item.thumbnail_url.replace(/^http:/, 'https:') : null;
                const images = productInfo?.image_urls || [secureThumbnail, 'https://via.placeholder.com/150'];
                return { ...item, cost_with_vat: costWithVat, images: images };
            })
        }));

        let filtered = enriched;

        // 2. Filtros
        if (filters.shippingType !== 'all') { filtered = filtered.filter(order => order.shipping_type === filters.shippingType); }
        if (filters.status !== 'all') {
            if (filters.status === 'daily_dispatch') {
                const today = new Date().toISOString().split('T')[0];
                filtered = filtered.filter(order => order.created_at.startsWith(today));
            } else if (filters.status === 'cancelled') {
                filtered = filtered.filter(order => order.status === 'Cancelado' || order.status === 'cancelled');
            }
            else {
                filtered = filtered.filter(order => order.status === filters.status);
            }
        }

        if (filters.printStatus !== 'all') {
            if (filters.printStatus === 'pending_print') {
                filtered = filtered.filter(order => order.shipping_status === 'ready_to_ship' && order.shipping_substatus === 'ready_to_print');
            } else if (filters.printStatus === 'printed') {
                 filtered = filtered.filter(order => order.shipping_status === 'ready_to_ship' && order.shipping_substatus === 'printed');
            }
        }

        // 3. Búsqueda
        if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            filtered = filtered.filter(order =>
                order.meli_order_id?.toString().includes(term) ||
                order.buyer_name?.toLowerCase().includes(term) ||
                order.shipping_id?.toString().includes(term) ||
                order.order_items.some(item => item.sku?.toLowerCase().includes(term))
            );
        }
        return filtered;
    }, [salesOrders, products, searchTerm, filters]);

    // Paginación y useEffects (Se mantienen igual)
    const paginatedOrders = useMemo(() => { const from = page * ITEMS_PER_PAGE; const to = from + ITEMS_PER_PAGE; return processedOrders.slice(from, to); }, [processedOrders, page]);
    const totalPages = Math.ceil(processedOrders.length / ITEMS_PER_PAGE);
    useEffect(() => { if(salesOrders) setIsLoading(false); }, [salesOrders]);
    useEffect(() => { setPage(0); setSelectedOrders(new Set()); }, [searchTerm, filters]);
    useEffect(() => { setSelectedOrders(new Set()); }, [page]);

    // Handlers
    const handleSelectOrder = (orderId) => { const newSelection = new Set(selectedOrders); newSelection.has(orderId) ? newSelection.delete(orderId) : newSelection.add(orderId); setSelectedOrders(newSelection); };
    const handleSelectAll = (e) => { if (e.target.checked) { setSelectedOrders(new Set(paginatedOrders.map(o => o.id))); } else { setSelectedOrders(new Set()); } };
    
    // Sincronización Manual (Fallback)
    const handleSyncSales = async () => { 
        setIsSyncing(true); 
        try { 
            const { data, error } = await supabase.functions.invoke('mercadolibre-sync-orders'); 
            if (error) throw error; 
            showMessage(data.message || 'Sincronización manual completada.', 'success'); 
            // No es necesario llamar a fetchSalesOrders(), Realtime en App.js lo hará.
        } catch (err) { 
            showMessage(`Error en sincronización manual: ${err.message}`, 'error'); 
        } finally { 
            setIsSyncing(false); 
        } 
    };

    // --- USA LA LÓGICA CENTRALIZADA (RPC) ---
    const handleProcessOrder = async (orderId) => {
        setIsProcessing(orderId);
        try {
            // Llama a la función RPC de Supabase (¡Debes haber ejecutado el SQL!)
            const { data, error } = await supabase.rpc('process_existing_sale_order', {
                p_order_id: orderId
            });

            if (error) throw new Error(error.message);
            if (!data || !data.success) throw new Error(data?.message || 'Error desconocido al procesar.');

            showMessage(data.message, 'success');
            
            // Refrescamos los datos que pudieron cambiar (Stock y Pedidos a Proveedor). 
            // SalesOrders se actualizará por Realtime.
            await Promise.all([
                fetchSupplierOrders(), 
                fetchProducts()
                // fetchSalesOrders() // Opcional, ya que Realtime lo hace
            ]);
        } catch (err) {
            showMessage(`Error al procesar la orden: ${err.message}. ¿Ejecutaste el script SQL?`, 'error');
        } finally {
            setIsProcessing(null);
        }
    };
    
    // Helpers de formato (Ajustados para los nuevos estados)
    const formatDate = (dateString) => { /* ... */ };
    const getStatusChip = (status) => { const statuses = { 
        'Recibido': { text: 'Recibido (Sin procesar)', color: 'bg-cyan-500/20 text-cyan-300' }, 
        'Pendiente': { text: 'Pendiente (En Cola)', color: 'bg-yellow-500/20 text-yellow-300' }, 
        // Nuevo estado
        'Pendiente Proveedor': { text: 'Pendiente Proveedor', color: 'bg-orange-500/20 text-orange-300' }, 
        'En Preparación': { text: 'En Preparación', color: 'bg-blue-500/20 text-blue-300' }, 
        'Preparado': { text: 'Preparado', color: 'bg-indigo-500/20 text-indigo-300' }, 
        'Despachado': { text: 'Despachado', color: 'bg-green-500/20 text-green-300' }, 
        'Cancelado': { text: 'Cancelado', color: 'bg-red-500/20 text-red-300' } 
    }; const { text, color } = statuses[status] || { text: status, color: 'bg-gray-700 text-gray-300' }; return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${color}`}>{text}</span>; };

    // --- Función de Impresión (Usando 'get-ml-labels' Edge Function) ---
    const handlePrintLabels = async (format) => {
       // (La implementación robusta de impresión se mantiene igual que en la respuesta anterior)
       // Copia aquí la función handlePrintLabels robusta que usa supabase.functions.invoke con responseType: 'blob'
    };
    
    // JSX Rendering (Asegúrate de copiar el JSX completo de la respuesta anterior, solo muestro las partes clave)
    return (
        <div>
             <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-white">Gestión de Ventas (Tiempo Real)</h2>
                {/* Mantenemos el botón como un fallback manual */}
                <button onClick={handleSyncSales} disabled={isSyncing} className="flex-shrink-0 px-4 py-2 bg-teal-600/50 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-teal-700 disabled:bg-gray-600">{isSyncing ? 'Sincronizando...' : 'Sincronización Manual (Respaldo)'}</button>
            </div>
            
            {/* ... (Búsqueda y Filtros) ... */}
            
            {/* Lista de Ventas */}
            <div className="space-y-4">
                {isLoading ? ( <p>Cargando...</p> ) : ( paginatedOrders.length > 0 ? paginatedOrders.map(order => (
                    <div key={order.id} className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                        {/* ... (Cabecera y Items) ... */}

                        {/* Pie de la Orden (Estado y Acciones) */}
                        <div className="p-4 bg-gray-800 border-t border-gray-700 flex justify-between items-center">
                            <div>{getStatusChip(order.status)}</div>
                            {/* Mostramos el botón solo si el estado es 'Recibido' (sin procesar) */}
                            {order.status === 'Recibido' && (
                                <button onClick={() => handleProcessOrder(order.id)} disabled={isProcessing === order.id} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600">
                                    {isProcessing === order.id ? 'Procesando...' : 'Procesar Pedido'}
                                </button>
                            )}
                        </div>
                    </div>
                )) : ( <div className="text-center py-12 px-6 bg-gray-800 border border-gray-700 rounded-lg"><h3 className="mt-2 text-lg font-medium text-white">No se encontraron ventas</h3><p className="mt-1 text-sm text-gray-400">Ajusta tu búsqueda y filtros. Las nuevas ventas aparecerán aquí automáticamente.</p></div>))}
            </div>

            {/* ... (Paginación y Modal) ... */}
        </div>
    );
};

export default SalesView;