import React, { useMemo } from 'react';
import { supabase } from '../supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const PurchaseOrderModal = ({ show, onClose, supplierName, orders, showMessage, onSaveSuccess }) => {
    
    const consolidatedOrders = useMemo(() => {
        if (!orders) return [];
        const groupedBySku = orders.reduce((acc, order) => {
            const sku = order.sku;
            if (acc[sku]) {
                acc[sku].quantity_to_order += order.quantity_to_order;
            } else {
                acc[sku] = { ...order };
            }
            return acc;
        }, {});
        return Object.values(groupedBySku);
    }, [orders]);

    if (!show) return null;

    const companyDetails = {
        name: "GRIMAX",
        address: "ARAOZ 164, Villa Crespo, Capital Federal",
        phone: "+54 11 1234-5678",
        email: "compras@tuempresa.com"
    };

    const today = new Date();
    const poNumber = `OC-${today.getTime().toString().slice(-6)}`;

    const savePurchaseOrder = async () => {
        const poData = {
            po_number: poNumber,
            supplier_name: supplierName,
            items: consolidatedOrders.map(order => ({
                sku: order.sku,
                quantity: order.quantity_to_order
            })),
            total_items: consolidatedOrders.reduce((sum, order) => sum + order.quantity_to_order, 0)
        };
        try {
            const { error } = await supabase.from('purchase_orders').insert(poData);
            if (error) throw error;
            showMessage(`Orden de Compra ${poNumber} guardada con éxito.`, 'success');
            if (onSaveSuccess) onSaveSuccess();
            return true;
        } catch (error) {
            showMessage(`Error al guardar la Orden de Compra: ${error.message}`, 'error');
            return false;
        }
    };

    const handleExportPDF = async () => {
        const saved = await savePurchaseOrder();
        if (!saved) return;

        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text("Orden de Compra", 14, 22);
        doc.text(`Nº: ${poNumber}`, 14, 30);
        doc.text(`Fecha: ${today.toLocaleDateString('es-AR')}`, 150, 30);
        doc.setFontSize(10);
        doc.text(companyDetails.name, 14, 40);
        doc.text(companyDetails.address, 14, 45);
        doc.setFontSize(12);
        doc.text("Proveedor:", 14, 60);
        doc.setFontSize(10);
        doc.text(supplierName, 14, 65);
        autoTable(doc, {
            startY: 80,
            head: [['SKU', 'Cantidad a Pedir']],
            body: consolidatedOrders.map(order => [order.sku, order.quantity_to_order]),
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] }
        });
        doc.save(`OC_${poNumber}_${supplierName}.pdf`);
    };

    const handleExportExcel = async () => {
        const saved = await savePurchaseOrder();
        if (!saved) return;
        
        const worksheet = XLSX.utils.json_to_sheet(
            consolidatedOrders.map(order => ({ SKU: order.sku, Cantidad: order.quantity_to_order }))
        );
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Orden de Compra");
        XLSX.writeFile(workbook, `OC_${poNumber}_${supplierName}.xlsx`);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col relative">
                <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 text-gray-400 hover:bg-gray-700">✕</button>
                <h3 className="text-lg font-bold text-white p-4 border-b border-gray-700">Orden de Compra: {poNumber}</h3>
                <div className="p-6 overflow-y-auto text-gray-300">
                    <div className="flex justify-between mb-6">
                        <div>
                            <h3 className="font-bold text-white">{companyDetails.name}</h3>
                            <p>{companyDetails.address}</p>
                        </div>
                        <div className="text-right">
                            <p><strong>Fecha:</strong> {today.toLocaleDateString('es-AR')}</p>
                            <p><strong>Proveedor:</strong> <span className="font-bold text-white">{supplierName}</span></p>
                        </div>
                    </div>
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                <th className="px-4 py-2">SKU</th>
                                <th className="px-4 py-2 text-right">Cantidad a Pedir</th>
                            </tr>
                        </thead>
                        <tbody>
                            {consolidatedOrders.map(order => (
                                <tr key={order.sku}>
                                    <td className="px-4 py-2 font-medium text-white">{order.sku}</td>
                                    <td className="px-4 py-2 text-right font-bold">{order.quantity_to_order}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end gap-4">
                    <button onClick={handleExportExcel} className="px-4 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Guardar y Exportar a Excel</button>
                    <button onClick={handleExportPDF} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Guardar y Descargar PDF</button>
                </div>
            </div>
        </div>
    );
};

export default PurchaseOrderModal;
