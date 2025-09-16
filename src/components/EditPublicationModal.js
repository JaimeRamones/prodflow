// Ruta: src/components/EditPublicationModal.js

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const EditPublicationModal = ({ 
    publication, 
    onClose, 
    onSave, 
    isSaving, 
    allowStockEdit = false,
    allowSafetyStockEdit = false,
    allowTitleEdit = false,
    allowDescriptionEdit = false
}) => {
    const { showMessage } = useContext(AppContext);
    const [newPrice, setNewPrice] = useState('');
    const [newSku, setNewSku] = useState('');
    const [newStock, setNewStock] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newSafetyStock, setNewSafetyStock] = useState('');
    
    // Estados para carga de descripción
    const [loadingDescription, setLoadingDescription] = useState(false);
    const [descriptionLoaded, setDescriptionLoaded] = useState(false);

    useEffect(() => {
        if (publication) {
            setNewPrice(publication.price?.toString() || '');
            setNewSku(publication.sku || '');
            setNewStock(publication.available_quantity?.toString() || '');
            setNewTitle(publication.title || '');
            setNewSafetyStock(publication.safety_stock?.toString() || '0');
            
            // Usar la descripción de la BD si existe, sino cargar desde ML
            if (publication.description) {
                setNewDescription(publication.description);
                setDescriptionLoaded(true);
            } else if (!descriptionLoaded) {
                loadDescriptionFromML();
            } else {
                setNewDescription('');
                setDescriptionLoaded(true);
            }
        }
    }, [publication]);

    const loadDescriptionFromML = async () => {
        if (!publication?.meli_id || loadingDescription) return;
        
        setLoadingDescription(true);
        try {
            // Obtener descripción usando nuestra edge function existente
            const response = await fetch(`https://api.mercadolibre.com/items/${publication.meli_id}/description`, {
                headers: {
                    'Authorization': `Bearer ${publication.access_token}` // Si tenemos el token
                }
            });

            if (response.ok) {
                const data = await response.json();
                const description = data.plain_text || '';
                setNewDescription(description);
                
                // Actualizar la publicación local para futuras cargas
                if (description) {
                    await supabase
                        .from('mercadolibre_listings')
                        .update({ description: description })
                        .eq('id', publication.id);
                }
            } else {
                throw new Error('No se pudo obtener la descripción');
            }
            
            setDescriptionLoaded(true);
        } catch (error) {
            console.error('Error cargando descripción:', error);
            showMessage('No se pudo cargar la descripción desde MercadoLibre', 'warning');
            setNewDescription('');
            setDescriptionLoaded(true);
        } finally {
            setLoadingDescription(false);
        }
    };

    const refreshDescription = async () => {
        setDescriptionLoaded(false);
        await loadDescriptionFromML();
    };

    const handleSave = () => {
        const updates = {};
        
        const priceValue = parseFloat(newPrice);
        if (!isNaN(priceValue) && priceValue > 0 && priceValue !== publication?.price) {
            updates.newPrice = priceValue;
        }
        
        if (newSku.trim() && newSku.trim() !== publication?.sku) {
            updates.newSku = newSku.trim();
        }
        
        if (newTitle.trim() && newTitle.trim() !== publication?.title) {
            updates.newTitle = newTitle.trim();
        }
        
        if (newDescription !== publication?.description) {
            updates.newDescription = newDescription;
        }
        
        const safetyStockValue = parseInt(newSafetyStock);
        if (!isNaN(safetyStockValue) && safetyStockValue >= 0 && safetyStockValue !== (publication?.safety_stock || 0)) {
            updates.newSafetyStock = safetyStockValue;
        }
        
        if (allowStockEdit) {
            const stockValue = parseInt(newStock);
            if (!isNaN(stockValue) && stockValue >= 0 && stockValue !== publication?.available_quantity) {
                updates.newStock = stockValue;
            }
        }
        
        if (Object.keys(updates).length === 0) {
            showMessage('No hay cambios para guardar', 'info');
            return;
        }
        
        onSave(updates);
    };

    const hasChanges = () => {
        const priceChanged = parseFloat(newPrice) !== publication?.price;
        const skuChanged = newSku.trim() !== publication?.sku;
        const titleChanged = newTitle.trim() !== publication?.title;
        const descriptionChanged = newDescription !== publication?.description;
        const safetyStockChanged = parseInt(newSafetyStock) !== (publication?.safety_stock || 0);
        const stockChanged = allowStockEdit && parseInt(newStock) !== publication?.available_quantity;
        
        return priceChanged || skuChanged || titleChanged || descriptionChanged || safetyStockChanged || stockChanged;
    };

    if (!publication) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-white">Editar Publicación</h3>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-1"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
                
                <p className="text-gray-400 text-sm mb-6">
                    ID: {publication.meli_id} | Estado: 
                    <span className={`ml-1 px-2 py-1 rounded text-xs ${
                        publication.status === 'active' ? 'bg-green-600 text-white' : 
                        publication.status === 'paused' ? 'bg-yellow-600 text-white' : 
                        'bg-gray-600 text-white'
                    }`}>
                        {publication.status}
                    </span>
                </p>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Columna izquierda */}
                    <div className="space-y-4">
                        {/* Título */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Título de la Publicación
                            </label>
                            <textarea
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                disabled={!allowTitleEdit}
                                className={`w-full px-3 py-2 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${
                                    allowTitleEdit ? 'bg-gray-700' : 'bg-gray-800 cursor-not-allowed'
                                }`}
                                placeholder="Título del producto"
                                rows="2"
                                maxLength="60"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                {newTitle.length}/60 caracteres. 
                                {!allowTitleEdit && <span className="text-yellow-400"> (No editable - producto con ventas o en catálogo)</span>}
                            </p>
                        </div>

                        {/* Campos en fila */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Precio */}
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

                            {/* SKU */}
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

                        {/* Stock y Stock de Seguridad */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Stock Disponible - Solo si allowStockEdit */}
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
                                </div>
                            )}

                            {/* Stock de Seguridad */}
                            <div className={allowStockEdit ? '' : 'col-span-2'}>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Stock de Seguridad
                                </label>
                                <input
                                    type="number"
                                    value={newSafetyStock}
                                    onChange={(e) => setNewSafetyStock(e.target.value)}
                                    disabled={!allowSafetyStockEdit}
                                    className={`w-full px-3 py-2 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                                        allowSafetyStockEdit ? 'bg-gray-700' : 'bg-gray-800 cursor-not-allowed'
                                    }`}
                                    placeholder="Stock de seguridad"
                                    min="0"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Se resta del stock disponible. Útil para reservar productos.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Columna derecha */}
                    <div className="space-y-4">
                        {/* Descripción */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-gray-300">
                                    Descripción
                                </label>
                                <div className="flex items-center space-x-2">
                                    {publication.description && (
                                        <span className="text-xs text-green-400">✓ En BD</span>
                                    )}
                                    {!loadingDescription && (
                                        <button
                                            onClick={refreshDescription}
                                            className="text-xs text-blue-400 hover:text-blue-300"
                                        >
                                            🔄 Recargar desde ML
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            {loadingDescription ? (
                                <div className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                                    <div className="flex items-center space-x-2 text-gray-400">
                                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                        <span className="text-sm">Cargando descripción...</span>
                                    </div>
                                </div>
                            ) : (
                                <textarea
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    disabled={!allowDescriptionEdit}
                                    className={`w-full px-3 py-2 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${
                                        allowDescriptionEdit ? 'bg-gray-700' : 'bg-gray-800 cursor-not-allowed'
                                    }`}
                                    placeholder="Descripción del producto (acepta HTML básico)"
                                    rows="8"
                                />
                            )}
                            
                            <p className="text-xs text-gray-400 mt-1">
                                Puedes usar HTML básico: &lt;b&gt;, &lt;i&gt;, &lt;br&gt;, &lt;ul&gt;, etc.
                            </p>
                        </div>

                        {/* Información actual en card compacta */}
                        <div className="bg-gray-900/50 rounded-lg p-4">
                            <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                Valores actuales
                            </h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
                                <div>Precio: <span className="text-white">${publication.price}</span></div>
                                <div>SKU: <span className="text-white">{publication.sku || 'N/A'}</span></div>
                                <div>Disponible: <span className="text-green-400">{publication.available_quantity}</span></div>
                                <div>Seguridad: <span className="text-orange-400">{publication.safety_stock || 0}</span></div>
                                <div>Vendidos: <span className="text-blue-400">{publication.sold_quantity || 0}</span></div>
                                <div>Tipo: <span className="text-yellow-400">{publication.listing_type_id || 'N/A'}</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Advertencia sobre restricciones */}
                <div className="mt-6 p-3 bg-yellow-900/30 border border-yellow-600/30 rounded-lg">
                    <div className="flex items-start">
                        <svg className="w-5 h-5 text-yellow-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path>
                        </svg>
                        <div>
                            <p className="text-yellow-400 text-sm font-medium">Restricciones de MercadoLibre</p>
                            <p className="text-yellow-200 text-xs mt-1">
                                Publicaciones con ventas o en catálogo de ML tienen restricciones para editar título y SKU visible. 
                                La función te informará qué se pudo actualizar correctamente.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Botones */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges()}
                        className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSaving ? (
                            <div className="flex items-center justify-center">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                Guardando...
                            </div>
                        ) : (
                            'Guardar Cambios'
                        )}
                    </button>
                </div>

                {!hasChanges() && !isSaving && (
                    <p className="text-xs text-gray-400 text-center mt-2">
                        No hay cambios para guardar
                    </p>
                )}
            </div>
        </div>
    );
};

export default EditPublicationModal;