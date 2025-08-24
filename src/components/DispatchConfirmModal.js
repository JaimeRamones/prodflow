import React, { useState } from 'react';
import { AlertTriangle, Truck } from 'lucide-react';

const DispatchConfirmModal = ({ show, onCancel, onConfirm, selectedCount }) => {
    const [confirmationText, setConfirmationText] = useState('');
    const requiredText = `DESPACHAR ${selectedCount}`;
    const isTextCorrect = confirmationText.toUpperCase() === requiredText;

    if (!show || selectedCount === 0) return null;

    return (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-2xl max-w-md w-full border-t-8 border-green-600">
                <div className="text-center">
                    <Truck className="mx-auto text-green-500" size={48} />
                    <h3 className="text-2xl font-bold text-green-700 mt-4">Confirmar Despacho Masivo</h3>
                    <p className="text-gray-600 mt-2">
                        Estás a punto de despachar y finalizar <strong>{selectedCount}</strong> pedido(s). Esta acción descontará el stock del inventario.
                    </p>
                    <p className="text-sm text-gray-800 mt-6 font-semibold">
                        Para confirmar, por favor escribe la siguiente frase exacta:
                    </p>
                    <p className="text-lg font-mono bg-gray-100 p-2 rounded-md my-2 text-indigo-700 tracking-widest">
                        {requiredText}
                    </p>
                </div>
                <div className="mt-6">
                    <input
                        type="text"
                        className={`w-full px-4 py-2 border ${isTextCorrect ? 'border-green-500' : 'border-gray-300'} rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-center font-mono uppercase`}
                        value={confirmationText}
                        onChange={(e) => setConfirmationText(e.target.value)}
                        placeholder="Escribe la frase aquí"
                    />
                </div>
                <div className="flex justify-end space-x-4 mt-8">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2 rounded-lg font-semibold bg-gray-200 text-gray-800 hover:bg-gray-300 transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={!isTextCorrect}
                        className={`px-6 py-2 rounded-lg font-semibold text-white transition ${
                            isTextCorrect
                                ? 'bg-green-600 hover:bg-green-700 shadow-lg transform hover:scale-105'
                                : 'bg-gray-400 cursor-not-allowed'
                        }`}
                    >
                        Confirmar Despacho
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DispatchConfirmModal;
