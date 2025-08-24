// src/components/WarehouseView.js

import React, { useContext, useMemo, useState } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient'; // Importamos Supabase
// Quitamos los modals por ahora para simplificar, los puedes añadir luego si quieres
// import PickingListModal from './PickingListModal'; 
// import DispatchConfirmModal from './DispatchConfirmModal';

// =================================================================
// SUB-COMPONENTE REUTILIZABLE PARA LA TABLA DE PEDIDOS (MIGRADO)
// =================================================================
const OrderTable = ({ title, orders, onSelect, selectedOrders = [], onUpdateStatus, onDispatch, onCancel, isMyAssignedTable = false }) => {
    
    const handleSelectAll = (e) => {
        if (onSelect) {
            if (e.target.checked) { onSelect(orders.map(o => o.id)); }
            else { onSelect([]); }
        }
    };
    
    const handleSelect = (orderId) => {
        if (selectedOrders.includes(orderId)) {
            onSelect(selectedOrders.filter(id => id !== orderId));
        } else {
            onSelect([...selectedOrders, orderId]);
        }
    };

    const getStatusChip = (status) => {
        const statuses = {
            'Pendiente': { text: 'Pendiente', color: 'bg-yellow-900/50 text-yellow-300' },
            'En Preparación': { text: 'En Preparación', color: 'bg-blue-900/50 text-blue-300' },
            'Preparado': { text: 'Preparado', color: 'bg-indigo-900/50 text-indigo-300' },
        };
        const { text, color } = statuses[status] || { text: status, color: 'bg-gray-700 text-gray-300' };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>{text}</span>;
    };

    const getActionButtons = (order) => (
        <div className="flex items-center justify-center space-x-2">
            {order.status === 'En Preparación' && <button onClick={() => onUpdateStatus(order.id, 'Preparado')} className="px-3 py-1 bg-indigo-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-indigo-700">Preparado</button>}
            {order.status === 'Preparado' && <button onClick={() => onDispatch(order)} className="p-1.5 rounded-full hover:bg-green-800/50" title="Despachar Pedido"><svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 17.5V6.5C3 5.67157 3.67157 5 4.5 5H13"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5H17.5C18.3284 5 19 5.67157 19 6.5V11.5"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11.5H21L23 14.5V17.5H3"></path><circle cx="6.5" cy="19.5" r="2"></circle><circle cx="16.5" cy="19.5" r="2"></circle></svg></button>}
            <button onClick={() => onCancel(order)} className="p-1.5 rounded-full hover:bg-red-800/50" title="Cancelar y Devolver a Stock"><svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></button>
        </div>
    );
    
    const getShippingChip = (saleType) => {
        if (saleType === 'flex') {
            return ( <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900/50 text-yellow-300 items-center">⚡️ FLEX</span> );
        }
        return ( <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-300">M. Envíos</span> );
    };

    return (
       <div className="bg-gray-800 border border-gray-700 p-4 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-white mb-4">{title} ({orders.length})</h3>
            {orders.length === 0 ? (
                <p className="text-gray-400 text-center py-4">No hay pedidos en esta sección.</p>
            ) : (
                <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                {!isMyAssignedTable && <th className="p-2 text-center"><input type="checkbox" onChange={handleSelectAll} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600" /></th>}
                                <th className="px-4 py-3">Tipo Envío</th>
                                <th className="px-4 py-3">SKUs</th>
                                <th className="px-4 py-3 text-center">Cant. Items</th>
                                <th className="px-4 py-3 text-center">Estado</th>
                                <th className="px-4 py-3 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {orders.map(order => (
                                <tr key={order.id} className="hover:bg-gray-700/50">
                                    {!isMyAssignedTable && <td className="p-2 text-center"><input type="checkbox" checked={selectedOrders.includes(order.id)} onChange={() => handleSelect(order.id)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-600" /></td>}
                                    <td className="px-4 py-3">{getShippingChip(order.sale_type)}</td>
                                    <td className="px-4 py-3 font-medium text-white">{order.order_items.map(item => item.sku).join(', ')}</td>
                                    <td className="px-4 py-3 text-center">{order.order_items.reduce((sum, item) => sum + item.quantity, 0)}</td>
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

// =================================================================
// COMPONENTE PRINCIPAL DE LA VISTA DE DEPÓSITO (MIGRADO)
// =================================================================
const WarehouseView = () => {
    const { showMessage, session, salesOrders, products, fetchSalesOrders, fetchProducts } = useContext(AppContext);
    const [selectedUnassigned, setSelectedUnassigned] = useState([]);

    const { myAssignedOrders, unassignedOrders } = useMemo(() => {
        if (!salesOrders) return { myAssignedOrders: [], unassignedOrders: [] };
        
        const myOrders = [];
        const unassigned = [];
        salesOrders.forEach(order => {
            // Un pedido es para el depósito si está 'Pendiente' o en estados de preparación
            const isWarehouseOrder = ['Pendiente', 'En Preparación', 'Preparado'].includes(order.status);
            
            if (isWarehouseOrder) {
                if (order.assigned_to === session.user.id) {
                    myOrders.push(order);
                } else if (!order.assigned_to) {
                    unassigned.push(order);
                }
            }
        });
        
        // Ordena para que los 'flex' aparezcan primero
        const sorter = (a, b) => {
            if (a.sale_type === 'flex' && b.sale_type !== 'flex') return -1;
            if (a.sale_type !== 'flex' && b.sale_type === 'flex') return 1;
            return new Date(a.created_at) - new Date(b.created_at);
        };

        return { myAssignedOrders: myOrders.sort(sorter), unassignedOrders: unassigned.sort(sorter) };
    }, [salesOrders, session.user.id]);
    
    // Función para actualizar el estado de un pedido
    const handleUpdateStatus = async (orderId, newStatus) => {
        try {
            const { error } = await supabase.from('sales_orders').update({ status: newStatus }).eq('id', orderId);
            if (error) throw error;
            await fetchSalesOrders(); // Refresca los pedidos
        } catch (err) {
            showMessage(`Error al actualizar estado: ${err.message}`, 'error');
        }
    };
    
    // Función para despachar un único pedido
    const handleDispatch = async (order) => {
        try {
            const { error } = await supabase.rpc('dispatch_order', { p_order_id: order.id });
            if (error) throw error;
            await Promise.all([fetchSalesOrders(), fetchProducts()]);
            showMessage('Pedido despachado con éxito', 'success');
        } catch (err) {
            showMessage(`Error al despachar: ${err.message}`, 'error');
        }
    };
    
    // Función para cancelar un pedido
    const handleCancelOrder = async (order) => {
        if (!window.confirm(`¿Seguro que quieres cancelar el pedido y devolver el stock?`)) return;
        
        try {
            const { error } = await supabase.rpc('cancel_sale_order', { p_order_id: order.id });
            if (error) throw error;
            await Promise.all([fetchSalesOrders(), fetchProducts()]);
            showMessage('Pedido cancelado y stock devuelto.', 'success');
        } catch (err) {
            showMessage(`Error al cancelar: ${err.message}`, 'error');
        }
    };
    
    // Función para asignarse pedidos y generar la hoja de picking
    const handleAssignAndGeneratePickingList = async () => {
        if (selectedUnassigned.length === 0) return;

        try {
            // Llama a la función de la base de datos para asignar los pedidos
            const { error } = await supabase.rpc('assign_orders_to_user', {
                p_order_ids: selectedUnassigned,
                p_user_id: session.user.id
            });
            if (error) throw error;

            // Lógica para generar la hoja de picking (se mantiene en el cliente)
            const pickingList = {};
            selectedUnassigned.forEach(orderId => {
                const order = unassignedOrders.find(o => o.id === orderId);
                if (order) {
                    order.order_items.forEach(item => {
                        pickingList[item.sku] = (pickingList[item.sku] || 0) + item.quantity;
                    });
                }
            });
            
            // Aquí puedes abrir tu modal de hoja de picking si lo deseas
            console.log("Hoja de Picking Generada:", pickingList);
            showMessage(`${selectedUnassigned.length} pedido(s) asignados a ti.`, 'success');
            
            await fetchSalesOrders(); // Refresca la lista de pedidos
            setSelectedUnassigned([]); // Limpia la selección
        } catch (err) {
            showMessage(`Error al asignar pedidos: ${err.message}`, 'error');
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Pedidos Sin Asignar (Cola General)</h2>
                    <button
                        onClick={handleAssignAndGeneratePickingList}
                        disabled={selectedUnassigned.length === 0}
                        className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition disabled:bg-gray-600 disabled:cursor-not-allowed mt-4 sm:mt-0"
                    >
                        Asignármelos y Preparar ({selectedUnassigned.length})
                    </button>
                </div>
                <OrderTable 
                    title="Listos para Preparar" 
                    orders={unassignedOrders} 
                    selectedOrders={selectedUnassigned}
                    onSelect={setSelectedUnassigned}
                    onUpdateStatus={handleUpdateStatus} // No se usará en esta tabla, pero se pasa por si acaso
                    onDispatch={handleDispatch}
                    onCancel={handleCancelOrder}
                />
            </div>

            <div>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Mis Pedidos Asignados</h2>
                    {/* Podrías añadir un botón de despacho masivo aquí si lo necesitas */}
                </div>
                <OrderTable 
                    title="Mi Cola de Trabajo" 
                    orders={myAssignedOrders}
                    onUpdateStatus={handleUpdateStatus}
                    onDispatch={handleDispatch}
                    onCancel={handleCancelOrder}
                    isMyAssignedTable={true}
                />
            </div>
        </div>
    );
};

export default WarehouseView;