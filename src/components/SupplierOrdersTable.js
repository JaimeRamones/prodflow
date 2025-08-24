import React, { useState, useContext, useEffect, useMemo } from 'react'; // <-- CORRECCIÓN AQUÍ
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import PurchaseOrderModal from './PurchaseOrderModal';

const SupplierOrdersTable = () => {
    const { showMessage, session, supplierOrders, suppliers, fetchSupplierOrders, fetchPurchaseOrders } = useContext(AppContext);
    const [supplierFilter, setSupplierFilter] = useState('');
    const [saleTypeFilter, setSaleTypeFilter] = useState('');
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [hideInvoiced, setHideInvoiced] = useState(false);
    const [purchaseOrderData, setPurchaseOrderData] = useState(null);

    // --- LÓGICA DE FILTRADO ---
    const filteredOrders = useMemo(() => {
        if (!supplierOrders) return [];
        return supplierOrders.filter(order => {
            const matchesSupplier = !supplierFilter || order.supplier_id === parseInt(supplierFilter, 10);
            const matchesInvoiced = !hideInvoiced || order.status !== 'Facturado';
            const matchesSaleType = !saleTypeFilter || order.sale_type === saleTypeFilter;
            return matchesSupplier && matchesInvoiced && matchesSaleType;
        });
    }, [supplierOrders, supplierFilter, hideInvoiced, saleTypeFilter]);
    
    // Efecto para limpiar la selección si los filtros cambian
    useEffect(() => {
        setSelectedOrders([]);
    }, [supplierFilter, saleTypeFilter, hideInvoiced]);


    if (!supplierOrders || !suppliers) {
        return (
            <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md mt-8">
                <h3 className="text-xl font-semibold text-white mb-4">Pedidos a Proveedor</h3>
                <p className="text-center text-gray-400">Cargando...</p>
            </div>
        );
    }

    const handleSelectOrder = (orderId) => {
        setSelectedOrders(prev =>
            prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
        );
    };

    // --- NUEVA FUNCIÓN: Para seleccionar/deseleccionar todos los pedidos filtrados ---
    const handleSelectAll = () => {
        if (selectedOrders.length === filteredOrders.length) {
            // Si ya están todos seleccionados, deseleccionar todos
            setSelectedOrders([]);
        } else {
            // Si no, seleccionar todos los que están visibles
            setSelectedOrders(filteredOrders.map(order => order.id));
        }
    };

    const handleMarkAsInvoiced = async () => {
        if (selectedOrders.length === 0) return;
        
        try {
            const { error } = await supabase
                .from('supplier_orders')
                .update({ status: 'Facturado' })
                .in('id', selectedOrders);

            if (error) throw error;
            
            showMessage(`${selectedOrders.length} pedido(s) marcados como facturados.`, 'success');
            setSelectedOrders([]);
            await fetchSupplierOrders();
        } catch (err) {
            showMessage(`Error al marcar como facturados: ${err.message}`, 'error');
        }
    };
    
    const handleMarkAsDone = async (orderId) => {
        try {
            const { error } = await supabase.from('supplier_orders').delete().eq('id', orderId);
            if (error) throw error;
            showMessage('Pedido marcado como realizado.', 'success');
            await fetchSupplierOrders();
        } catch (err) {
            showMessage(`Error al marcar como realizado: ${err.message}`, 'error');
        }
    };

    const handleSupplierChange = async (orderId, newSupplierId) => {
        try {
            const { error } = await supabase
                .from('supplier_orders')
                .update({ supplier_id: newSupplierId })
                .eq('id', orderId);

            if (error) throw error;

            showMessage('Proveedor actualizado correctamente.', 'success');
            await fetchSupplierOrders(); 
        } catch (err) {
            showMessage(`Error al actualizar el proveedor: ${err.message}`, 'error');
        }
    };

    const handleGeneratePurchaseOrder = () => {
        const selectedSupplier = suppliers.find(s => s.id === parseInt(supplierFilter, 10));
        if (!selectedSupplier) {
            showMessage("Por favor, selecciona un proveedor para generar la Orden de Compra.", "error");
            return;
        }
        
        const ordersForSupplier = filteredOrders.filter(o => selectedOrders.includes(o.id));
        setPurchaseOrderData({
            supplierName: selectedSupplier.name,
            orders: ordersForSupplier
        });
    };

    return (
        <>
            <div className="bg-gray-800 border border-gray-700 p-4 rounded-lg shadow-md mt-8">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
                    Pedidos a Proveedor <span className="ml-2 text-base font-normal text-gray-400">({filteredOrders.length})</span>
                </h3>
                
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4 p-4 bg-gray-900/50 rounded-lg">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Filtrar por Proveedor:</label>
                        <select 
                            className="w-full p-2 border rounded-lg bg-gray-700 border-gray-600 text-white text-sm" 
                            value={supplierFilter} 
                            onChange={(e) => setSupplierFilter(e.target.value)}
                        >
                            <option value="">Todos los Proveedores</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Filtrar por Tipo de Venta:</label>
                        <select 
                            className="w-full p-2 border rounded-lg bg-gray-700 border-gray-600 text-white text-sm" 
                            value={saleTypeFilter} 
                            onChange={(e) => setSaleTypeFilter(e.target.value)}
                        >
                            <option value="">Todos los Tipos</option>
                            <option value="mercado_envios">Mercado Envíos</option>
                            <option value="flex">Flex</option>
                        </select>
                    </div>

                    <div className="flex items-center space-x-4 pt-6">
                        <label className="flex items-center text-sm font-medium text-gray-300">
                            <input type="checkbox" className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500" checked={hideInvoiced} onChange={(e) => setHideInvoiced(e.target.checked)} />
                            <span className="ml-2">Ocultar facturados</span>
                        </label>
                    </div>
                </div>

                <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-4">
                        <button onClick={handleMarkAsInvoiced} disabled={selectedOrders.length === 0} className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:bg-gray-600">
                            Marcar {selectedOrders.length} como Facturados
                        </button>
                        <button onClick={handleGeneratePurchaseOrder} disabled={selectedOrders.length === 0 || !supplierFilter} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600" title={!supplierFilter ? "Primero filtra por un proveedor" : "Generar OC para los pedidos seleccionados"}>
                            Generar Orden de Compra
                        </button>
                    </div>
                </div>

                <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                {/* --- CHECKBOX PARA SELECCIONAR TODOS --- */}
                                <th className="p-2 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500"
                                        onChange={handleSelectAll}
                                        // Se marca si el número de seleccionados es igual al de filtrados (y hay al menos uno)
                                        checked={filteredOrders.length > 0 && selectedOrders.length === filteredOrders.length}
                                    />
                                </th>
                                <th className="px-4 py-3">SKU</th>
                                <th className="px-4 py-3">Cant.</th>
                                <th className="px-4 py-3">Proveedor</th>
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3">Estado</th>
                                <th className="px-4 py-3 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {filteredOrders.map(order => (
                                <tr key={order.id} className={order.status === 'Facturado' ? 'bg-green-900/20' : 'hover:bg-gray-700/50'}>
                                    <td className="p-2 text-center">
                                        {order.status !== 'Facturado' && <input type="checkbox" className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-blue-500" checked={selectedOrders.includes(order.id)} onChange={() => handleSelectOrder(order.id)} />}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-white">{order.sku}</td>
                                    <td className="px-4 py-3">{order.quantity_to_order}</td>
                                    
                                    <td className="px-4 py-3">
                                        <select 
                                            value={order.supplier_id || ''}
                                            onChange={(e) => handleSupplierChange(order.id, e.target.value)}
                                            className="w-full p-1.5 border rounded-lg bg-gray-700 border-gray-600 text-white text-sm focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="" disabled>Seleccionar...</option>
                                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </td>

                                    <td className="px-4 py-3">{new Date(order.created_at).toLocaleDateString('es-AR')}</td>
                                    <td className="px-4 py-3">
                                        {order.status === 'Facturado' ? (<span className="px-2 inline-flex text-xs font-semibold rounded-full bg-green-900/50 text-green-300">Facturado</span>) : (<span className="px-2 inline-flex text-xs font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendiente</span>)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button onClick={() => handleMarkAsDone(order.id)} className="px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-blue-700">Realizado</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <PurchaseOrderModal
                show={!!purchaseOrderData}
                onClose={() => setPurchaseOrderData(null)}
                supplierName={purchaseOrderData?.supplierName}
                orders={purchaseOrderData?.orders}
                showMessage={showMessage}
                onSaveSuccess={fetchPurchaseOrders}
            />
        </>
    );
};

export default SupplierOrdersTable;
