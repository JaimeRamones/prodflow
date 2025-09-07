// Ruta: src/components/SalesView.js
// VERSIÓN POTENCIADA: Incluye filtros avanzados, selección masiva, cálculo de costos y diseño mejorado.

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

// Iconos para diferenciar tipos de envío
const FlexIcon = () => (
    <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd"></path></svg>
);

const ShippingIcon = () => (
    <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"></path><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v5a1 1 0 001 1h2.05a2.5 2.5 0 014.9 0H21a1 1 0 001-1V8a1 1 0 00-1-1h-7z"></path></svg>
);


const SalesView = () => {
    const { session, products, showMessage } = useContext(AppContext);
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [count, setCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    
    // --- NUEVOS ESTADOS PARA FILTROS Y SELECCIÓN ---
    const [selectedOrders, setSelectedOrders] = useState(new Set());
    const [filters, setFilters] = useState({
        shippingType: 'all', // 'all', 'flex', 'fulfillment', etc.
        status: 'all', // 'all', 'printed', 'ready_to_ship', 'cancelled', 'daily_dispatch'
    });
    
    const ITEMS_PER_PAGE = 50; // Aumentado a 50 como solicitaste

    // --- LÓGICA DE BÚSQUEDA Y FILTRADO ---
    useEffect(() => {
        const fetchOrders = async () => {
            if (!session) return;
            setIsLoading(true);

            const from = page * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            let query = supabase
                .from('sales_orders')
                .select(`*, order_items ( * )`, { count: 'exact' });

            // Búsqueda por término general
            if (searchTerm.trim()) {
                const term = `%${searchTerm.trim()}%`;
                query = query.or(`meli_order_id::text.ilike.${term},buyer_name.ilike.${term},shipping_id::text.ilike.${term},order_items.sku.ilike.${term}`, { foreignTable: 'order_items' });
            }

            // Filtros específicos
            if (filters.shippingType !== 'all') {
                query = query.eq('shipping_type', filters.shippingType);
            }
            if (filters.status !== 'all') {
                // Para 'daily_dispatch', necesitarías una lógica de fecha
                if (filters.status === 'daily_dispatch') {
                    const today = new Date().toISOString().split('T')[0];
                    query = query.gte('created_at', `${today}T00:00:00.000Z`).lt('created_at', `${today}T23:59:59.999Z`);
                } else {
                    query = query.eq('status', filters.status);
                }
            }
            
            const { data, error, count } = await query
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) {
                console.error("Error fetching orders:", error);
                showMessage("Error al cargar las ventas: " + error.message, "error");
                setOrders([]);
            } else {
                // Enriquecemos los datos como antes, pero ahora es más robusto
                const enrichedOrders = data.map(order => ({
                    ...order,
                    order_items: order.order_items.map(item => {
                        const productInfo = products.find(p => p.sku === item.sku);
                        // Añadimos cálculo de costo + IVA
                        const costWithVat = productInfo?.cost_price ? productInfo.cost_price * 1.21 : 0;
                        return {
                            ...item,
                            title: item.title || productInfo?.name || 'Producto Desconocido',
                            images: productInfo?.image_urls || [item.thumbnail_url, 'https://via.placeholder.com/150'],
                            cost_with_vat: costWithVat.toFixed(2),
                        };
                    })
                }));
                setOrders(enrichedOrders);
                setCount(count || 0);
            }
            setIsLoading(false);
        };

        const debounceTimeout = setTimeout(fetchOrders, 300);
        return () => clearTimeout(debounceTimeout);
    }, [page, session, products, searchTerm, filters, showMessage]);
    
    // Resetear página al cambiar filtros o búsqueda
    useEffect(() => {
        setPage(0);
    }, [searchTerm, filters]);

    // --- LÓGICA DE SELECCIÓN DE ÓRDENES ---
    const handleSelectOrder = (orderId) => {
        const newSelection = new Set(selectedOrders);
        if (newSelection.has(orderId)) {
            newSelection.delete(orderId);
        } else {
            newSelection.add(orderId);
        }
        setSelectedOrders(newSelection);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedOrders(new Set(orders.map(o => o.id)));
        } else {
            setSelectedOrders(new Set());
        }
    };

    // --- LÓGICA PARA IMPRIMIR ETIQUETAS (PLACEHOLDER) ---
    const handlePrintLabels = (format) => {
        if (selectedOrders.size === 0) {
            showMessage("Por favor, selecciona al menos una venta para imprimir.", "info");
            return;
        }
        const selectedIds = Array.from(selectedOrders);
        console.log(`Imprimiendo ${selectedIds.length} etiquetas en formato ${format}...`);
        showMessage(`Función de imprimir en ${format} no implementada. IDs seleccionados: ${selectedIds.join(', ')}`, "warning");
        // Aquí iría la lógica para llamar a una Edge Function que genere el PDF/ZPL
    };

    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleDateString('es-AR', options);
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-6">Gestión de Ventas</h2>
            
            {/* --- SECCIÓN DE FILTROS Y BÚSQUEDA --- */}
            <div className="bg-gray-800 border border-gray-700 p-4 rounded-lg mb-6 space-y-4">
                <input
                    type="text"
                    placeholder="Buscar por Nº de Venta, SKU, Comprador o Nº de Envío..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white"
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <select value={filters.shippingType} onChange={e => setFilters({...filters, shippingType: e.target.value})} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white">
                        <option value="all">Todos los Envíos</option>
                        <option value="flex">Flex</option>
                        <option value="fulfillment">Mercado Envíos</option>
                    </select>
                    <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white">
                        <option value="all">Todos los Estados</option>
                        <option value="printed">Etiqueta Impresa</option>
                        <option value="ready_to_ship">Listo para Recolección</option>
                        <option value="daily_dispatch">Envíos del Día</option>
                        <option value="cancelled">Canceladas</option>
                    </select>
                </div>
            </div>

             {/* --- BARRA DE ACCIONES MASIVAS --- */}
            <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center">
                    <input type="checkbox" onChange={handleSelectAll} checked={selectedOrders.size === orders.length && orders.length > 0} className="w-5 h-5 bg-gray-700 border-gray-600 rounded" />
                    <label className="ml-2 text-sm text-gray-400">Seleccionar todos ({selectedOrders.size} seleccionados)</label>
                </div>
                <button onClick={() => handlePrintLabels('pdf')} disabled={selectedOrders.size === 0} className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50">Imprimir PDF</button>
                <button onClick={() => handlePrintLabels('zpl')} disabled={selectedOrders.size === 0} className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:opacity-50">Imprimir ZPL</button>
            </div>


            {/* --- LISTADO DE VENTAS --- */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg">
                {isLoading ? ( <p className="text-center p-8 text-gray-400">Cargando ventas...</p> ) : (
                    <div className="divide-y divide-gray-700">
                        {orders.length > 0 ? orders.map(order => (
                            <div key={order.id} className="p-4 flex gap-4">
                                <input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => handleSelectOrder(order.id)} className="mt-1 w-5 h-5 flex-shrink-0 bg-gray-700 border-gray-600 rounded" />
                                
                                <div className="flex-grow">
                                    {/* Cabecera de la orden */}
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="text-white font-bold text-lg">Venta #{order.meli_order_id}</p>
                                            <p className="text-sm text-gray-400">Comprador: {order.buyer_name || 'N/A'}</p>
                                            <p className="text-xs text-gray-500">Fecha: {formatDate(order.created_at)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-semibold text-white">${new Intl.NumberFormat('es-AR').format(order.total_amount)}</p>
                                            <div className="flex items-center justify-end gap-2 mt-1">
                                                {order.shipping_type === 'flex' ? <FlexIcon /> : <ShippingIcon />}
                                                <span className="px-2 py-1 text-xs rounded-full bg-gray-700 text-gray-300 capitalize">{order.shipping_type === 'flex' ? 'Flex' : 'Mercado Envíos'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Items de la orden */}
                                    <div className="border-t border-gray-700 pt-3 space-y-4">
                                        {order.order_items.map((item, index) => (
                                            <div key={index} className="flex items-start gap-4">
                                                <div className="flex-shrink-0 flex gap-2">
                                                    <img src={item.images[0]} alt={item.title} className="w-16 h-16 object-cover rounded-md border border-gray-600" />
                                                    {item.images[1] && <img src={item.images[1]} alt={item.title} className="hidden md:block w-16 h-16 object-cover rounded-md border border-gray-600" />}
                                                </div>
                                                <div className="flex-grow">
                                                    <p className="text-white font-semibold">{item.title}</p>
                                                    <p className="text-sm text-gray-400 font-mono bg-gray-900 inline-block px-2 py-0.5 rounded">SKU: {item.sku}</p>
                                                </div>
                                                <div className="text-right flex-shrink-0 w-48">
                                                    <p className="text-gray-200 font-semibold">{item.quantity} x ${new Intl.NumberFormat('es-AR').format(item.unit_price || 0)}</p>
                                                    <p className="text-xs text-yellow-400">Costo c/IVA: ${new Intl.NumberFormat('es-AR').format(item.cost_with_vat)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )) : ( <p className="text-center p-8 text-gray-500">No se encontraron ventas con los filtros aplicados.</p> )}
                    </div>
                )}
                 {/* Paginación */}
                 <div className="flex justify-between items-center p-4 border-t border-gray-700">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || isLoading} className="px-4 py-2 bg-gray-600 text-white rounded-lg disabled:opacity-50">Anterior</button>
                    <span className="text-gray-400">Página {page + 1} de {totalPages > 0 ? totalPages : 1}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1 || isLoading} className="px-4 py-2 bg-gray-600 text-white rounded-lg disabled:opacity-50">Siguiente</button>
                </div>
            </div>
        </div>
    );
};

export default SalesView;
