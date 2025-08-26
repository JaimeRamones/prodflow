// Ruta: src/components/SalesView.js
import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const ITEMS_PER_PAGE = 20;

const SalesView = () => {
    const { session, products } = useContext(AppContext);
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [count, setCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchOrders = async () => {
            if (!session) return;
            setIsLoading(true);

            const from = page * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            let query = supabase
                .from('sales_orders')
                .select(`*, order_items ( * )`, { count: 'exact' });

            if (searchTerm.trim()) {
                const term = searchTerm.trim();
                query = query.or(`meli_order_id::text.ilike.%${term}%,buyer_name.ilike.%${term}%,order_items.sku.ilike.%${term}%`, { foreignTable: 'order_items' });
            }
            
            const { data, error, count } = await query
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) {
                console.error("Error fetching orders:", error);
                setOrders([]);
            } else {
                const enrichedOrders = data.map(order => ({
                    ...order,
                    order_items: order.order_items.map(item => {
                        const productInfo = products.find(p => p.sku === item.sku);
                        return {
                            ...item,
                            title: item.title || productInfo?.name || 'Producto Desconocido',
                            thumbnail_url: item.thumbnail_url || productInfo?.image_url || 'https://via.placeholder.com/100'
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
    }, [page, session, products, searchTerm]);
    
    useEffect(() => {
        setPage(0);
    }, [searchTerm]);

    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleDateString('es-ES', options);
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-6">Gestión de Ventas</h2>
            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Buscar por Nº de Venta, SKU o Comprador..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                />
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-lg">
                {isLoading ? ( <p className="text-center p-8 text-gray-400">Cargando ventas...</p> ) : (
                    <div className="divide-y divide-gray-700">
                        {orders.length > 0 ? orders.map(order => (
                            <div key={order.id} className="p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-white font-bold">
                                            {order.meli_order_id ? `Venta ML #${order.meli_order_id}` : `Venta Manual #${order.id}`}
                                        </p>
                                        <p className="text-sm text-gray-400">Comprador: {order.buyer_name || 'N/A'}</p>
                                        <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-semibold text-white">${new Intl.NumberFormat('es-AR').format(order.total_amount)}</p>
                                        <span className="px-2 py-1 text-xs rounded-full bg-blue-500 text-blue-100 capitalize">{order.shipping_type || 'default'}</span>
                                    </div>
                                </div>
                                <div className="border-t border-gray-700 pt-3 mt-3 space-y-3">
                                    {order.order_items.map((item, index) => (
                                        <div key={index} className="flex items-center space-x-4">
                                            <img src={item.thumbnail_url} alt={item.title} className="w-12 h-12 object-cover rounded-md" />
                                            <div className="flex-grow">
                                                <p className="text-white font-semibold">{item.title}</p>
                                                <p className="text-sm text-gray-400">SKU: {item.sku}</p>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-gray-300">{item.quantity} x ${new Intl.NumberFormat('es-AR').format(item.unit_price || item.sale_price || 0)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )) : ( <p className="text-center p-8 text-gray-500">No se encontraron ventas.</p> )}
                    </div>
                )}
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