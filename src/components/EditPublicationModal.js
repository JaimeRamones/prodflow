// Ruta: src/components/EditPublicationModal.js

import React, { useState, useEffect } from 'react';

const EditPublicationModal = ({ publication, onClose, onSave, isSaving, allowStockEdit = false }) => {
    const [newPrice, setNewPrice] = useState('');
    const [newSku, setNewSku] = useState('');
    const [newStock, setNewStock] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');

    useEffect(() => {
        if (publication) {
            setNewPrice(publication.price?.toString() || '');
            setNewSku(publication.sku || '');
            setNewStock(publication.available_quantity?.toString() || '');
            setNewTitle(publication.title || '');
            setNewDescription(publication.description || '');
        }
    }, [publication]);

    const handleSave = () => {
        const updates = {};
        
        const priceValue = parseFloat(newPrice);
        if (!isNaN(priceValue) && priceValue > 0) {
            updates.newPrice = priceValue;
        }
        
        if (newSku.trim() && newSku.trim() !== publication?.sku) {
            updates.newSku = newSku.trim();
        }
        
        if (newTitle.trim() && newTitle.trim() !== publication?.title) {
            updates.newTitle = newTitle.trim();
        }
        
        if (newDescription !== undefined && newDescription !== publication?.description) {
            updates.newDescription = newDescription;
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
        const titleChanged = newTitle.trim() !== publication?.title;
        const descriptionChanged = newDescription !== publication?.description;
        const stockChanged = allowStockEdit && parseInt(newStock) !== publication?.available_quantity;
        return priceChanged || skuChanged || titleChanged || descriptionChanged || stockChanged;
    };

    if (!publication) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-semibold text-white mb-4">Editar Publicación</h3>
                <p className="text-gray-400 text-sm mb-4">ID: {publication.meli_id}</p>
                
                <div className="space-y-4">
                    {/* Campo de Título */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Título de la Publicación
                        </label>
                        <textarea
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            placeholder="Título del producto"
                            rows="2"
                            maxLength="60"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            {newTitle.length}/60 caracteres. Restricciones de ML pueden aplicar.
                        </p>
                    </div>

                    {/* Campos en dos columnas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                    {/* Campo de Descripción */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Descripción
                        </label>
                        <textarea
                            value={newDescription}
                            onChange={(e) => setNewDescription(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            placeholder="Descripción del producto (acepta HTML básico)"
                            rows="4"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Puedes usar HTML básico: &lt;b&gt;, &lt;i&gt;, &lt;br&gt;, etc.
                        </p>
                    </div>
                </div>

                {/* Información actual */}
                <div className="mt-4 p-3 bg-gray-900/50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Valores actuales:</h4>
                    <div className="text-xs text-gray-400 space-y-1">
                        <p>Precio: <span className="text-white">${publication.price}</span></p>
                        <p>SKU: <span className="text-white">{publication.sku || 'N/A'}</span></p>
                        <p>Título: <span className="text-white">{publication.title?.substring(0, 50)}{publication.title?.length > 50 ? '...' : ''}</span></p>
                        {allowStockEdit && (
                            <p>Stock: <span className="text-white">{publication.available_quantity}</span></p>
                        )}
                    </div>
                </div>

                {/* Advertencia sobre restricciones */}
                <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600/30 rounded-lg">
                    <div className="flex items-center">
                        <svg className="w-5 h-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path>
                        </svg>
                        <div>
                            <p className="text-yellow-400 text-sm font-medium">Restricciones de MercadoLibre</p>
                            <p className="text-yellow-200 text-xs">Publicaciones con ventas pueden tener restricciones para editar título. La función te informará qué se pudo actualizar.</p>
                        </div>
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