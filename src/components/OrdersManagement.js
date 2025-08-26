import React, { useState, useContext, useEffect } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

// Importamos todos los componentes modulares
import PendingOrdersTable from './PendingOrdersTable';
import SupplierOrdersTable from './SupplierOrdersTable';
import ToggleSwitch from './ToggleSwitch';
import PurchaseOrderModal from './PurchaseOrderModal';
import NewSaleForm from './NewSaleForm'; // Asumimos que este archivo existe

// --- SUB-COMPONENTE PARA EL HISTORIAL DE OC (de tu archivo original) ---
const PurchaseOrderHistory = () => {
    const { showMessage, purchaseOrders, fetchPurchaseOrders } = useContext(AppContext);
    const [filteredPOs, setFilteredPOs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewingPO, setViewingPO] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        setFilteredPOs(purchaseOrders || []);
        setLoading(false);
    }, [purchaseOrders]);

    const handleFilter = async () => {
        if (!startDate || !endDate) {
            showMessage("Por favor, selecciona una fecha de inicio y de fin.", "error");
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('purchase_orders')
                .select('*')
                .gte('created_at', startDate)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setFilteredPOs(data);
        } catch (error) {
            showMessage(`Error al filtrar Órdenes de Compra: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };
    
    const handleReset = () => {
        setStartDate('');
        setEndDate('');
        setFilteredPOs(purchaseOrders || []);
    };

    return (
        <>
            <div className="bg-gray-800 border border-gray-700 p-4 rounded-lg shadow-md mt-8">
                <h3 className="text-xl font-semibold text-white mb-4">Historial de Órdenes de Compra</h3>
                <div className="flex flex-col sm:flex-row items-center gap-4 mb-4 p-4 bg-gray-900/50 rounded-lg">
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Desde</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-2 bg-gray-700 border-gray-600 rounded-md text-white" />
                    </div>
                    <div className="flex-1 w-full">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Hasta</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-2 bg-gray-700 border-gray-600 rounded-md text-white" />
                    </div>
                    <div className="flex gap-2 pt-6">
                        <button onClick={handleFilter} className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700">Buscar</button>
                        <button onClick={handleReset} className="px-5 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500">Resetear</button>
                    </div>
                </div>
                <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                <th className="px-4 py-3">Nº Orden</th>
                                <th className="px-4 py-3">Proveedor</th>
                                <th className="px-4 py-3">Fecha</th>
                                <th className="px-4 py-3 text-center">Items</th>
                                <th className="px-4 py-3 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {loading && <tr><td colSpan="5" className="text-center py-4">Cargando...</td></tr>}
                            {!loading && filteredPOs.map(po => (
                                <tr key={po.id} className="hover:bg-gray-700/50">
                                    <td className="px-4 py-3 font-medium text-white">{po.po_number}</td>
                                    <td className="px-4 py-3">{po.supplier_name}</td>
                                    <td className="px-4 py-3">{new Date(po.created_at).toLocaleDateString('es-AR')}</td>
                                    <td className="px-4 py-3 text-center">{po.total_items}</td>
                                    <td className="px-4 py-3 text-center">
                                        <button onClick={() => setViewingPO(po)} className="font-medium text-blue-400 hover:underline">Ver / Descargar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <PurchaseOrderModal
                show={!!viewingPO}
                onClose={() => setViewingPO(null)}
                supplierName={viewingPO?.supplier_name}
                orders={viewingPO?.items.map(item => ({ sku: item.sku, quantity_to_order: item.quantity }))}
                showMessage={showMessage}
                onSaveSuccess={fetchPurchaseOrders}
            />
        </>
    );
};

const OrdersManagement = () => {
    const { products, salesOrders } = useContext(AppContext);
    const [showOnlyInStock, setShowOnlyInStock] = useState(true);

    const hasSufficientStock = (order) => {
        if (!products || !order.order_items) return false;
        return order.order_items.every(item => {
            const product = products.find(p => p.id === item.product_id);
            if (!product) return false;
            return (product.stock_disponible || 0) >= item.quantity;
        });
    };

    const filteredOrders = salesOrders.filter(order => !showOnlyInStock || hasSufficientStock(order));
    const pendingMercadoEnvios = filteredOrders.filter(o => o.shipping_type === 'mercado_envios' && o.status === 'Pendiente');
    const pendingFlex = filteredOrders.filter(o => o.shipping_type === 'flex' && o.status === 'Pendiente');

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-white">Gestión de Pedidos</h2>
            </div>
            <NewSaleForm />
            <div className="my-6 p-4 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-between">
                <div>
                    <p className="font-semibold text-white">Mostrar solo pedidos con stock disponible</p>
                    <p className="text-sm text-gray-400">Desactiva para ver todos los pedidos pendientes.</p>
                </div>
                <ToggleSwitch checked={showOnlyInStock} onChange={() => setShowOnlyInStock(!showOnlyInStock)} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
                <PendingOrdersTable title="Pedidos Mercado Envíos Pendientes" orders={pendingMercadoEnvios} />
                <PendingOrdersTable title="Pedidos Flex Pendientes" orders={pendingFlex} />
            </div>
            <SupplierOrdersTable />
            <PurchaseOrderHistory />
        </div>
    );
};

export default OrdersManagement;
