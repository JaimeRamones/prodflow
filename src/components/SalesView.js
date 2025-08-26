// Ruta: src/components/SalesView.js

import React, { useState, useEffect, useMemo, useContext } from 'react';
import { AppContext } from '../App';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db as firestoreDb } from '../firebaseConfig'; // Renombramos 'db' para evitar conflictos
import { supabase } from '../supabaseClient';

// --- SUB-COMPONENTE PARA LA FILA DE VENTA (Adaptado para datos unificados) ---
const SaleRow = ({ sale }) => {
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);
    const formatDate = (date) => new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const getShippingInfo = (sale) => {
        if (sale.channel === 'mercadolibre') {
            if (sale.shippingType === 'flex') return { icon: '🛵', text: 'Mercado Envíos Flex' };
            if (sale.shippingType === 'full') return { icon: '📦', text: 'Mercado Envíos Full' };
            return { icon: '🚚', text: 'Mercado Envíos' };
        }
        return { icon: '👤', text: 'Venta Manual' };
    };

    const shippingInfo = getShippingInfo(sale);

    return (
        <tr className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50">
            <td className="w-4 p-4">
                <div className="flex items-center">
                    <input id={`checkbox-${sale.id}`} type="checkbox" className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-600" />
                    <label htmlFor={`checkbox-${sale.id}`} className="sr-only">checkbox</label>
                </div>
            </td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                    <span className="text-xl">{shippingInfo.icon}</span>
                    <div>
                        <div className="font-semibold text-white">Pedido Nº {sale.displayId}</div>
                        <div className="text-xs text-gray-400">{formatDate(sale.date)}</div>
                    </div>
                </div>
                <div className="pl-10 mt-2 space-y-2">
                    {sale.items.map((item, index) => (
                        <div key={index} className="flex items-center gap-2">
                            <img src={item.thumbnail_url || 'https://via.placeholder.com/40'} alt={item.title} className="w-10 h-10 object-cover rounded-md" />
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-amber-300 bg-gray-900/80 border border-gray-700 px-2 py-0.5 rounded-md text-sm">{item.quantity}x</span>
                                    <span className="text-sm text-gray-200">{item.title || 'Producto sin nombre'}</span>
                                </div>
                                <div className="text-xs font-mono text-sky-400">SKU: {item.sku}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </td>
            <td className="px-6 py-4 text-right">
                <span className="px-2 py-0.5 text-xs font-semibold text-green-300 bg-green-900/50 rounded-full capitalize">{sale.status}</span>
                <div className="font-bold text-white mt-1">{formatCurrency(sale.total)}</div>
            </td>
            <td className="px-6 py-4 text-right">
                <div className="text-sm text-gray-300">{shippingInfo.text}</div>
                <button className="mt-1 text-sm font-medium text-blue-500 hover:underline">Imprimir etiqueta</button>
            </td>
        </tr>
    );
};


// --- COMPONENTE PRINCIPAL (Ahora carga datos de Firestore y Supabase) ---
const SalesView = () => {
    const { session } = useContext(AppContext);
    const [firestoreSales, setFirestoreSales] = useState([]);
    const [supabaseSales, setSupabaseSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ status: 'all', channel: 'all' });

    // Carga de ventas de Firestore (tu código original)
    useEffect(() => {
        const q = query(collection(firestoreDb, 'salesOrders'), orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const salesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setFirestoreSales(salesData);
        }, (error) => console.error("Error al cargar ventas de Firestore:", error));
        return () => unsubscribe();
    }, []);

    // Carga de ventas de Supabase (la nueva lógica)
    useEffect(() => {
        if (!session) return;
        const fetchSupabaseSales = async () => {
            const { data, error } = await supabase
                .from('sales_orders')
                .select(`*, order_items (*)`)
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error("Error al cargar ventas de Supabase:", error);
            } else {
                setSupabaseSales(data);
            }
        };
        fetchSupabaseSales();
    }, [session]);

    // Unimos y procesamos los datos de ambas fuentes
    const allSales = useMemo(() => {
        setLoading(true);
        // Normalizamos los datos de Firestore a un formato común
        const normalizedFirestore = firestoreSales.map(sale => ({
            id: `fs-${sale.id}`,
            displayId: sale.id.substring(0, 10).toUpperCase(),
            date: sale.timestamp ? sale.timestamp.toDate() : new Date(),
            total: sale.items ? sale.items.reduce((total, item) => total + (item.price * item.quantity), 0) : (sale.price * sale.quantity) || 0,
            status: sale.status || 'paid',
            channel: 'manual',
            shippingType: sale.shippingType || 'default',
            items: sale.items || [{ quantity: sale.quantity, title: sale.productName, sku: sale.sku, thumbnail_url: null }]
        }));

        // Normalizamos los datos de Supabase a un formato común
        const normalizedSupabase = supabaseSales.map(order => ({
            id: `sb-${order.id}`,
            displayId: order.meli_order_id,
            date: order.created_at,
            total: order.total_amount,
            status: order.status,
            channel: 'mercadolibre',
            shippingType: order.shipping_type,
            items: order.order_items.map(item => ({
                quantity: item.quantity,
                title: item.title,
                sku: item.sku,
                thumbnail_url: item.thumbnail_url
            }))
        }));

        // Unimos, filtramos y ordenamos
        const combined = [...normalizedFirestore, ...normalizedSupabase];

        const filtered = combined.filter(sale => {
            const statusMatch = filters.status === 'all' || sale.status === filters.status;
            const channelMatch = filters.channel === 'all' || sale.channel === filters.channel;
            return statusMatch && channelMatch;
        });

        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        setLoading(false);
        return filtered;

    }, [firestoreSales, supabaseSales, filters]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-white">Ventas</h2>
                <div className="flex items-center gap-4">
                    {/* Filtros que ya tenías */}
                    <select name="status" value={filters.status} onChange={handleFilterChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 text-white">
                        <option value="all">Todo Estado</option>
                        <option value="paid">Pagado</option>
                        <option value="shipped">Despachado</option>
                    </select>
                    <select name="channel" value={filters.channel} onChange={handleFilterChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 text-white">
                        <option value="all">Todo Canal</option>
                        <option value="manual">Manual</option>
                        <option value="mercadolibre">Mercado Libre</option>
                    </select>
                </div>
            </div>

            <main className="relative overflow-x-auto shadow-md sm:rounded-lg">
                {loading ? (
                    <p className="text-center text-gray-400 p-8">Cargando ventas...</p>
                ) : (
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                <th scope="col" className="p-4">
                                    <div className="flex items-center">
                                        <input id="checkbox-all" type="checkbox" className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded" />
                                        <label htmlFor="checkbox-all" className="sr-only">checkbox</label>
                                    </div>
                                </th>
                                <th scope="col" className="px-6 py-3">Pedido</th>
                                <th scope="col" className="px-6 py-3 text-right">Pago</th>
                                <th scope="col" className="px-6 py-3 text-right">Entrega</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allSales.length > 0 ? (
                                allSales.map(sale => <SaleRow key={sale.id} sale={sale} />)
                            ) : (
                                <tr>
                                    <td colSpan="4" className="text-center text-gray-500 p-8">
                                        No se encontraron ventas con los filtros seleccionados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </main>
        </div>
    );
};

export default SalesView;




