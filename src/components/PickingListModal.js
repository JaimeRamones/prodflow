import React from 'react';

const PickingListModal = ({ show, onClose, pickingList }) => {
    if (!show) return null;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl">
                <style>{`
                    @media print {
                        body * {
                            visibility: hidden;
                        }
                        .printable-area, .printable-area * {
                            visibility: visible;
                        }
                        .printable-area {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                        }
                        .no-print {
                            display: none;
                        }
                    }
                `}</style>
                <div className="printable-area">
                    <h2 className="text-2xl font-bold mb-4 text-center">Hoja de Picking</h2>
                    <div className="overflow-x-auto rounded-lg border">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium uppercase">SKU</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium uppercase">Cantidad a Recoger</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y">
                                {pickingList.sort((a, b) => a.sku.localeCompare(b.sku)).map(item => (
                                    <tr key={item.sku}>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">{item.sku}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-2xl font-bold text-center">{item.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="flex justify-end gap-4 pt-6 no-print">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">Cerrar</button>
                    <button onClick={handlePrint} className="px-4 py-2 bg-green-600 text-white rounded-md">Imprimir</button>
                </div>
            </div>
        </div>
    );
};

export default PickingListModal;