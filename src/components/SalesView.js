import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// --- SUB-COMPONENTE PARA LA FILA DE VENTA (CON ÍCONOS DE ENVÍO CORREGIDOS) ---
const SaleRow = ({ sale }) => {
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);
    };
    
    const orderTotal = sale.items 
        ? sale.items.reduce((total, item) => total + (item.price * item.quantity), 0) 
        : (sale.price * sale.quantity) || 0;

    // --- INICIO DE CORRECCIÓN DE ÍCONOS ---
    const getShippingInfo = (sale) => {
        if (sale.channel === 'mercadolibre') {
            if (sale.shippingType === 'flex') {
                // Los envíos Flex usan la moto
                return { icon: '🛵', text: 'Mercado Envíos Flex', provider: 'Mercado Libre' };
            }
            // Los envíos normales de Mercado Libre ahora usan el camión
            return { icon: '🚚', text: 'Mercado Envíos', provider: 'Mercado Libre' };
        }
        // Los envíos propios también usan el camión
        return { icon: '🚚', text: 'Envío Propio', provider: 'Default' };
    };
    // --- FIN DE CORRECCIÓN DE ÍCONOS ---

    const shippingInfo = getShippingInfo(sale);

    return (
        <tr className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50">
            {/* Checkbox */}
            <td className="w-4 p-4">
                <div className="flex items-center">
                    <input id={`checkbox-${sale.id}`} type="checkbox" className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-600 ring-offset-gray-800 focus:ring-2" />
                    <label htmlFor={`checkbox-${sale.id}`} className="sr-only">checkbox</label>
                </div>
            </td>

            {/* Columna de Pedido (la más detallada) */}
            <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                    <span className="text-xl">{shippingInfo.icon}</span>
                    <div>
                        <div className="font-semibold text-white">Pedido Nº {sale.id.substring(0, 10).toUpperCase()}</div>
                        <div className="text-xs text-gray-400">
                            {sale.timestamp ? new Date(sale.timestamp.toDate()).toLocaleDateString() : 'N/A'}
                        </div>
                    </div>
                </div>
                <div className="pl-10 mt-2 space-y-2">
                    {sale.items && sale.items.length > 0 ? (
                        sale.items.map((item, index) => (
                            <div key={index}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-amber-300 bg-gray-900/80 border border-gray-700 px-2 py-0.5 rounded-md text-sm">
                                        {item.quantity}x
                                    </span>
                                    <span className="text-sm text-gray-200">{item.name || 'Producto sin nombre'}</span>
                                </div>
                                <div className="text-xs font-mono text-sky-400 bg-gray-900 px-2 py-1 rounded-md inline-block border border-gray-700">
                                    SKU: {item.sku}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-amber-300 bg-gray-900/80 border border-gray-700 px-2 py-0.5 rounded-md text-sm">
                                    {sale.quantity}x
                                </span>
                                <span className="text-sm text-gray-200">{sale.productName || 'Producto sin nombre'}</span>
                            </div>
                            <div className="text-xs font-mono text-sky-400 bg-gray-900 px-2 py-1 rounded-md inline-block border border-gray-700">
                                SKU: {sale.sku}
                            </div>
                        </div>
                    )}
                </div>
            </td>

            {/* Columna de Pago */}
            <td className="px-6 py-4 text-right">
                <div className="flex flex-col items-end">
                    <span className="px-2 py-0.5 text-xs font-semibold text-green-300 bg-green-900/50 rounded-full">
                        Aprobado
                    </span>
                    <div className="font-bold text-white mt-1">{formatCurrency(orderTotal)}</div>
                </div>
            </td>

            {/* Columna de Entrega */}
            <td className="px-6 py-4 text-right">
                <div className="flex flex-col items-end">
                    <div className="text-sm text-gray-300">Por enviar desde <span className="font-semibold">{shippingInfo.provider}</span></div>
                    <div className="text-xs font-semibold text-blue-400">{shippingInfo.text}</div>
                    <button className="mt-1 text-sm font-medium text-blue-500 hover:underline">
                        Imprimir etiqueta
                    </button>
                </div>
            </td>
        </tr>
    );
};


// --- COMPONENTE PRINCIPAL (SIN CAMBIOS) ---
const SalesView = () => {
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: 'all',
        channel: 'all',
    });

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    useEffect(() => {
        setLoading(true);
        let q = query(collection(db, 'salesOrders'), orderBy('timestamp', 'desc'));

        if (filters.status !== 'all') {
            q = query(q, where('status', '==', filters.status));
        }
        if (filters.channel !== 'all') {
            q = query(q, where('channel', '==', filters.channel));
        }
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const salesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSales(salesData);
            setLoading(false);
        }, (error) => {
            console.error("Error al cargar las ventas:", error);
            alert("Error al cargar las ventas. Es posible que necesites crear un índice en Firestore. Revisa la consola (F12).");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [filters]);

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-white">Ventas</h2>
                <div className="flex items-center gap-4">
                    <select 
                        name="status"
                        value={filters.status}
                        onChange={handleFilterChange}
                        className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="all">Todo Estado</option>
                        <option value="pending">Pendiente</option>
                        <option value="dispatched">Despachado</option>
                    </select>
                    <select 
                        name="channel"
                        value={filters.channel}
                        onChange={handleFilterChange}
                        className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-blue-500 focus:border-blue-500"
                    >
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
                                        <input id="checkbox-all" type="checkbox" className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-600 ring-offset-gray-800 focus:ring-2" />
                                        <label htmlFor="checkbox-all" className="sr-only">checkbox</label>
                                    </div>
                                </th>
                                <th scope="col" className="px-6 py-3">Pedido</th>
                                <th scope="col" className="px-6 py-3 text-right">Pago</th>
                                <th scope="col" className="px-6 py-3 text-right">Entrega</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sales.length > 0 ? (
                                sales.map(sale => <SaleRow key={sale.id} sale={sale} />)
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






