// Ruta: src/components/SalesView.js
// VERSIÓN CON DISEÑO MEJORADO Y FOTOS CORREGIDAS

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import ImageZoomModal from './ImageZoomModal';

// Iconos (sin cambios)
const FlexIcon = () => (
    <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd"></path></svg>
);
const ShippingIcon = () => (
    <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"></path><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v5a1 1 0 001 1h2.05a2.5 2.5 0 014.9 0H21a1 1 0 001-1V8a1 1 0 00-1-1h-7z"></path></svg>
);


const SalesView = () => {
    const { products, showMessage, salesOrders, fetchSalesOrders } = useContext(AppContext);
    const [isSyncing, setIsSyncing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [zoomedImageUrl, setZoomedImageUrl] = useState(null);

    // Lógica de filtrado
    const filteredOrders = React.useMemo(() => {
        if (!salesOrders) return [];
        let orders = [...salesOrders]; // Copiamos para no mutar el estado original
        
        if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            orders = orders.filter(order => 
                order.meli_order_id?.toString().includes(term) ||
                order.buyer_name?.toLowerCase().includes(term) ||
                order.shipping_id?.toString().includes(term) ||
                order.order_items.some(item => item.sku?.toLowerCase().includes(term) || item.title?.toLowerCase().includes(term))
            );
        }
        return orders;
    }, [salesOrders, searchTerm]);

    // Lógica para enriquecer datos del producto (costo, etc.)
    const enrichedOrders = React.useMemo(() => {
        return filteredOrders.map(order => ({
            ...order,
            order_items: order.order_items.map(item => {
                const productInfo = products.find(p => p.sku === item.sku);
                const costWithVat = productInfo?.cost_price ? (productInfo.cost_price * 1.21).toFixed(2) : 'N/A';
                return {
                    ...item,
                    cost_with_vat: costWithVat,
                };
            })
        }));
    }, [filteredOrders, products]);

    const handleSyncSales = async () => {
        setIsSyncing(true);
        try {
            const { data, error } = await supabase.functions.invoke('mercadolibre-sync-orders');
            if (error) throw error;
            showMessage(data.message || 'Ventas sincronizadas.', 'success');
            await fetchSalesOrders();
        } catch (err) {
            showMessage(`Error al sincronizar ventas: ${err.message}`, 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleString('es-AR', options);
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                 <h2 className="text-3xl font-bold text-white">Gestión de Ventas</h2>
                 <div className="flex items-center gap-4 w-full md:w-auto">
                    <input
                        type="text"
                        placeholder="Buscar por Nº Venta, SKU, Comprador..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button 
                        onClick={handleSyncSales} 
                        disabled={isSyncing}
                        className="flex-shrink-0 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                        {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                    </button>
                 </div>
            </div>
            
            {/* --- NUEVO LISTADO DE VENTAS CON DISEÑO DE TARJETAS --- */}
            <div className="space-y-4">
                {enrichedOrders.length > 0 ? enrichedOrders.map(order => (
                    <div key={order.id} className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                        {/* Cabecera de la Orden */}
                        <div className="p-4 bg-gray-800/50 flex flex-col sm:flex-row justify-between items-start gap-2 border-b border-gray-700">
                            <div>
                                <p className="text-sm font-semibold text-blue-400">Venta #{order.meli_order_id}</p>
                                <p className="text-lg font-bold text-white">{order.buyer_name || 'Comprador Desconocido'}</p>
                                <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                                <p className="text-2xl font-bold text-white">${new Intl.NumberFormat('es-AR').format(order.total_amount || 0)}</p>
                                <div className="flex items-center justify-end gap-2 mt-1">
                                    {order.shipping_type === 'flex' ? <FlexIcon /> : <ShippingIcon />}
                                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-700 text-gray-200 capitalize">
                                        {order.shipping_type === 'flex' ? 'Envío Flex' : 'Mercado Envíos'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Items de la Orden */}
                        <div className="p-4 space-y-3">
                            {order.order_items.map(item => (
                                <div key={item.meli_item_id} className="flex items-start gap-4 p-2 rounded-md hover:bg-gray-700/50">
                                    {/* --- CORRECCIÓN DE LA IMAGEN --- */}
                                    <img 
                                        src={item.thumbnail_url} // Este es el campo correcto que guardamos en la función
                                        alt={item.title} 
                                        className="w-20 h-20 object-cover rounded-md border-2 border-gray-600 cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => setZoomedImageUrl(item.thumbnail_url)}
                                        onError={(e) => { e.target.onerror = null; e.target.src='https://via.placeholder.com/150'; }} // Fallback si la imagen no carga
                                    />
                                    <div className="flex-grow">
                                        <p className="font-semibold text-white leading-tight">{item.title}</p>
                                        <p className="text-sm text-gray-400 font-mono bg-gray-900/80 inline-block px-2 py-0.5 rounded mt-1">SKU: {item.sku || 'N/A'}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0 w-40">
                                        <p className="text-white font-semibold">{item.quantity} x ${new Intl.NumberFormat('es-AR').format(item.unit_price || 0)}</p>
                                        <p className="text-xs text-yellow-400 mt-1">Costo c/IVA: ${item.cost_with_vat}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )) : ( 
                    <div className="text-center py-12 px-6 bg-gray-800 border border-gray-700 rounded-lg">
                        <svg className="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <h3 className="mt-2 text-lg font-medium text-white">No se encontraron ventas</h3>
                        <p className="mt-1 text-sm text-gray-400">Prueba a sincronizar o ajusta tu búsqueda.</p>
                    </div>
                )}
            </div>
            
            <ImageZoomModal 
                imageUrl={zoomedImageUrl} 
                onClose={() => setZoomedImageUrl(null)} 
            />
        </div>
    );
};

export default SalesView;