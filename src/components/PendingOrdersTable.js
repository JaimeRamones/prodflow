import React, { useState, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
// import PickingListModal from './PickingListModal'; // Asumimos que este modal existe

const PendingOrdersTable = ({ title, orders }) => {
    const { products, showMessage, fetchProducts, fetchSalesOrders } = useContext(AppContext);
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [isPickingListModalOpen, setIsPickingListModalOpen] = useState(false);
    const [pickingListData, setPickingListData] = useState([]);

    // --- CORRECCIÓN CLAVE: AÑADIMOS 'products' A LA COMPROBACIÓN ---
    // El componente no intentará renderizar la tabla hasta que tanto 'orders' como 'products' estén listos.
    if (!orders || !products) {
        return (
            <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-semibold text-white mb-4">{title}</h3>
                <p className="text-gray-400 text-center py-4">Cargando...</p>
            </div>
        );
    }

    const getStockStatus = (item) => {
        const product = products.find(p => p.id === item.product_id);
        if (!product) return false;
        return (product.stock_disponible || 0) >= item.quantity;
    };

    const handleSelectOrder = (orderId) => {
        setSelectedOrders(prev =>
            prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
        );
    };

    const handleUpdateStatus = async (orderId, newStatus) => {
        try {
            const { error } = await supabase.from('sales_orders').update({ status: newStatus }).eq('id', orderId);
            if (error) throw error;
            await fetchSalesOrders();
        } catch (err) {
            showMessage(`Error al actualizar estado: ${err.message}`, 'error');
        }
    };

    const handleDispatch = async (order) => {
        try {
            const stockUpdates = order.order_items.map(item => {
                const product = products.find(p => p.id === item.product_id);
                if (product) {
                    const newTotal = (product.stock_total || 0) - item.quantity;
                    const newReserved = (product.stock_reservado || 0) - item.quantity;
                    return supabase.from('products').update({
                        stock_total: newTotal < 0 ? 0 : newTotal,
                        stock_reservado: newReserved < 0 ? 0 : newReserved,
                    }).eq('id', product.id);
                }
                return Promise.resolve();
            });
            await Promise.all(stockUpdates);

            const { error: orderError } = await supabase.from('sales_orders').update({ status: 'Despachado' }).eq('id', order.id);
            if (orderError) throw orderError;

            await Promise.all([fetchSalesOrders(), fetchProducts()]);
        } catch (err) {
            showMessage(`Error al despachar: ${err.message}`, 'error');
        }
    };

    const generatePickingList = () => {
        if (selectedOrders.length === 0) return;
        const pickingList = {};
        const ordersToProcess = orders.filter(order => selectedOrders.includes(order.id));
        ordersToProcess.forEach(order => {
            order.order_items.forEach(item => {
                pickingList[item.sku] = (pickingList[item.sku] || 0) + item.quantity;
            });
        });
        const consolidatedList = Object.entries(pickingList).map(([sku, quantity]) => ({ sku, quantity }));
        setPickingListData(consolidatedList);
        setIsPickingListModalOpen(true);
    };

    const getStatusChip = (status) => {
        const statuses = {
            'Pendiente': { text: 'Pendiente', color: 'bg-yellow-900/50 text-yellow-300' },
            'En Preparación': { text: 'En Preparación', color: 'bg-blue-900/50 text-blue-300' },
            'Preparado': { text: 'Preparado', color: 'bg-indigo-900/50 text-indigo-300' },
        };
        const { text, color } = statuses[status] || { text: 'Desconocido', color: 'bg-gray-700 text-gray-300' };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>{text}</span>;
    };

    const getActionButtons = (order) => {
        switch (order.status) {
            case 'Pendiente':
                return <button onClick={() => handleUpdateStatus(order.id, 'En Preparación')} className="px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-blue-700">Empezar</button>;
            case 'En Preparación':
                return <button onClick={() => handleUpdateStatus(order.id, 'Preparado')} className="px-3 py-1 bg-indigo-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-indigo-700">Preparado</button>;
            case 'Preparado':
                return (
                    <button onClick={() => handleDispatch(order)} className="p-1.5 rounded-full hover:bg-green-800/50" title="Despachar Pedido">
                        <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 17.5V6.5C3 5.67157 3.67157 5 4.5 5H13"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5H17.5C18.3284 5 19 5.67157 19 6.5V11.5"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11.5H21L23 14.5V17.5H3"></path><circle cx="6.5" cy="19.5" r="2"></circle><circle cx="16.5" cy="19.5" r="2"></circle></svg>
                    </button>
                );
            default:
                return null;
        }
    };

    return (
        <div className="bg-gray-800 border border-gray-700 p-4 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-white flex items-center">{title} <span className="ml-2 text-base font-normal text-gray-400">({orders.length})</span></h3>
                <button onClick={generatePickingList} disabled={selectedOrders.length === 0} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600">Generar Hoja de Picking ({selectedOrders.length})</button>
            </div>
            
            {orders.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No hay pedidos para mostrar.</p>
            ) : (
                <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                <th className="p-2 text-center"><input type="checkbox" className="h-4 w-4 rounded bg-gray-700 border-gray-600" onChange={(e) => setSelectedOrders(e.target.checked ? orders.map(o => o.id) : [])} /></th>
                                <th className="px-4 py-3">SKU</th>
                                <th className="px-4 py-3 text-center">Cant.</th>
                                <th className="px-4 py-3 text-center">Estado</th>
                                <th className="px-4 py-3 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {orders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-700/50">
                                    <td className="p-2 text-center"><input type="checkbox" className="h-4 w-4 rounded bg-gray-700 border-gray-600" checked={selectedOrders.includes(order.id)} onChange={() => handleSelectOrder(order.id)} /></td>
                                    <td className="px-4 py-3 font-medium text-white">
                                        {order.order_items.map(item => (
                                            <div key={item.id} className="flex items-center">
                                                <span className={`w-2 h-2 rounded-full mr-2 ${getStockStatus(item) ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                {item.sku}
                                            </div>
                                        ))}
                                    </td>
                                    <td className="px-4 py-3 text-center">{order.order_items.reduce((acc, item) => acc + item.quantity, 0)}</td>
                                    <td className="px-4 py-3 text-center">{getStatusChip(order.status)}</td>
                                    <td className="px-4 py-3 text-center">{getActionButtons(order)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            
            {/* <PickingListModal show={isPickingListModalOpen} onClose={() => setIsPickingListModalOpen(false)} pickingList={pickingListData} /> */}
        </div>
    );
};

export default PendingOrdersTable;
