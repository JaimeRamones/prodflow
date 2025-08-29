// Ruta: src/components/EditPublicationModal.js
import React, { useState, useEffect } from 'react';

const EditPublicationModal = ({ publication, onClose, onSave, isSaving }) => {
    const [price, setPrice] = useState('');
    const [sku, setSku] = useState('');

    useEffect(() => {
        if (publication) {
            setPrice(publication.price || '');
            setSku(publication.sku || '');
        }
    }, [publication]);

    const handleSave = () => {
        // Validaciones básicas
        const newPrice = parseFloat(price);
        if (isNaN(newPrice) || newPrice <= 0) {
            alert('Por favor, introduce un precio válido.');
            return;
        }
        if (!sku || sku.trim() === '') {
            alert('El SKU no puede estar vacío.');
            return;
        }
        onSave({ newPrice, newSku: sku.trim() });
    };

    if (!publication) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg">
                <div className="p-6 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">Editar Publicación</h2>
                    <p className="text-sm text-gray-400 mt-1">{publication.title}</p>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block mb-2 text-sm font-medium text-white">Precio</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">$</span>
                            <input 
                                type="number"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                className="pl-7 border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 text-white"
                                placeholder="Ej: 15000.50"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block mb-2 text-sm font-medium text-white">SKU</label>
                        <input 
                            type="text"
                            value={sku}
                            onChange={(e) => setSku(e.target.value)}
                            className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 text-white"
                            placeholder="SKU del producto"
                        />
                    </div>
                </div>
                <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end gap-4">
                    <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-500">
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditPublicationModal;