import React, { useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const WarehouseOrdersTable = () => {
    const { salesOrders, showMessage, fetchSalesOrders, fetchProducts, products } = useContext(AppContext);

    if (!salesOrders || !products) {
        return <p className="text-center text-gray-400">Cargando pedidos del depósito...</p>;
    }

    // Filtramos los pedidos que deben aparecer en esta vista
    const warehouseOrders = salesOrders.filter(
        order => order.status === 'En Preparación' || order.status === 'Preparado'
    );

    const handleUpdateStatus = async (orderId, newStatus) => {
        try {
            const { error } = await supabase.from('sales_orders').update({ status: newStatus }).eq('id', orderId);
            if (error) throw error;
            await fetchSalesOrders();
            showMessage('Estado del pedido actualizado.', 'success');
        } catch (err) {
            showMessage(`Error al actualizar estado: ${err.message}`, 'error');
        }
    };

    const handleDispatch = async (order) => {
        try {
            // Inicia una transacción de base de datos
            const { error } = await supabase.rpc('dispatch_order', { p_order_id: order.id });

            if (error) {
                throw error;
            }

            showMessage('Pedido despachado y stock actualizado con éxito.', 'success');
            // Refrescamos todos los datos relevantes
            await Promise.all([fetchSalesOrders(), fetchProducts()]);

        } catch (err) {
            showMessage(`Error al despachar: ${err.message}`, 'error');
        }
    };

    const getStatusChip = (status) => {
        const statuses = {
            'En Preparación': { text: 'En Preparación', color: 'bg-blue-900/50 text-blue-300' },
            'Preparado': { text: 'Preparado', color: 'bg-indigo-900/50 text-indigo-300' },
        };
        const { text, color } = statuses[status] || { text: 'Desconocido', color: 'bg-gray-700 text-gray-300' };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>{text}</span>;
    };

    const getActionButtons = (order) => {
        switch (order.status) {
            case 'En Preparación':
                return <button onClick={() => handleUpdateStatus(order.id, 'Preparado')} className="px-3 py-1 bg-indigo-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-indigo-700">Marcar Preparado</button>;
            case 'Preparado':
                return <button onClick={() => handleDispatch(order)} className="px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-green-700">Despachar</button>;
            default:
                return null;
        }
    };

    return (
        <div className="bg-gray-800 border border-gray-700 p-4 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-white mb-4">
                Pedidos en Depósito <span className="ml-2 text-base font-normal text-gray-400">({warehouseOrders.length})</span>
            </h3>
            {warehouseOrders.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No hay pedidos en preparación.</p>
            ) : (
                <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                <th className="px-4 py-3">SKU</th>
                                <th className="px-4 py-3 text-center">Cant.</th>
                                <th className="px-4 py-3 text-center">Estado</th>
                                <th className="px-4 py-3 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {warehouseOrders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-700/50">
                                    <td className="px-4 py-3 font-medium text-white">
                                        {order.order_items.map(item => <div key={item.id}>{item.sku}</div>)}
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
        </div>
    );
};

export default WarehouseOrdersTable;