// Ruta: src/components/EditPublicationModal.js

import React, { useState, useEffect } from 'react';

const EditPublicationModal = ({ publication, onClose, onSave, isSaving, allowStockEdit = false }) => {
    const [newPrice, setNewPrice] = useState('');
    const [newSku, setNewSku] = useState('');
    const [newStock, setNewStock] = useState('');

    useEffect(() => {
        if (publication) {
            setNewPrice(publication.price?.toString() || '');
            setNewSku(publication.sku || '');
            setNewStock(publication.available_quantity?.toString() || '');
        }
    }, [publication]);

    const handleSave = () => {
        const updates = {};
        
        const priceValue = parseFloat(newPrice);
        if (!isNaN(priceValue) && priceValue > 0) {
            updates.newPrice = priceValue;
        }
        
        if (newSku.trim()) {
            updates.newSku = newSku.trim();
        }
        
        if (allowStockEdit) {
            const stockValue = parseInt(newStock);
            if (!isNaN(stockValue) && stockValue >= 0) {
                updates.newStock = stockValue;
            }
        }
        
        onSave(updates);
    };

    const hasChanges = () => {
        const priceChanged = parseFloat(newPrice) !== publication?.price;
        const skuChanged = newSku.trim() !== publication?.sku;
        const stockChanged = allowStockEdit && parseInt(newStock) !== publication?.available_quantity;
        return priceChanged || skuChanged || stockChanged;
    };

    if (!publication) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md mx-4">
                <h3 className="text-xl font-semibold text-white mb-4">Editar Publicación</h3>
                <p className="text-gray-400 text-sm mb-4">{publication.title}</p>
                
                <div className="space-y-4">
                    {/* Campo de Precio */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Precio
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
                            <input
                                type="number"
                                value={newPrice}
                                onChange={(e) => setNewPrice(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Precio de venta"
                                min="0"
                                step="0.01"
                            />
                        </div>
                    </div>

                    {/* Campo de SKU */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            SKU
                        </label>
                        <input
                            type="text"
                            value={newSku}
                            onChange={(e) => setNewSku(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Código SKU"
                        />
                    </div>

                    {/* Campo de Stock - Solo se muestra si allowStockEdit es true */}
                    {allowStockEdit && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Stock Disponible
                            </label>
                            <input
                                type="number"
                                value={newStock}
                                onChange={(e) => setNewStock(e.target.value)}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Cantidad disponible"
                                min="0"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Establece el stock manualmente (útil para casos específicos)
                            </p>
                        </div>
                    )}
                </div>

                {/* Información actual */}
                <div className="mt-4 p-3 bg-gray-900/50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Valores actuales:</h4>
                    <div className="text-xs text-gray-400 space-y-1">
                        <p>Precio: <span className="text-white">${publication.price}</span></p>
                        <p>SKU: <span className="text-white">{publication.sku || 'N/A'}</span></p>
                        {allowStockEdit && (
                            <p>Stock: <span className="text-white">{publication.available_quantity}</span></p>
                        )}
                    </div>
                </div>

                {/* Botones */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges()}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>

                {!hasChanges() && (
                    <p className="text-xs text-gray-400 text-center mt-2">
                        No hay cambios para guardar
                    </p>
                )}
            </div>
        </div>
    );
};

export default EditPublicationModal;