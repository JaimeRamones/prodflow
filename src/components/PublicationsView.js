// Ruta: src/components/PublicationsView.js

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import ImageZoomModal from './ImageZoomModal';
import EditPublicationModal from './EditPublicationModal';

const ITEMS_PER_PAGE = 50;
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutos para detectar nuevas publicaciones

// --- Componentes de UI (Pills y Toggle) ---
const StatusPill = ({ status }) => {
    const styles = {
        active: 'bg-green-500 text-green-100',
        paused: 'bg-yellow-500 text-yellow-100',
        under_review: 'bg-blue-500 text-blue-100',
        closed: 'bg-gray-500 text-gray-100'
    };
    const text = {
        active: 'Activa',
        paused: 'Pausada',
        under_review: 'En Revisión',
        closed: 'Finalizada'
    };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status] || styles.closed}`}>{text[status] || status}</span>;
};

const ListingTypePill = ({ type }) => {
    const styles = {
        gold_special: 'bg-amber-500 text-white',
        gold_pro: 'bg-yellow-600 text-white',
        free: 'bg-gray-400 text-gray-900'
    };
     const text = {
        gold_special: 'Clásica',
        gold_pro: 'Premium',
        free: 'Gratuita'
    };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[type] || styles.free}`}>{text[type] || type}</span>;
};

const ToggleSwitch = ({ checked, onChange }) => (
    <label className="relative inline-flex items-center cursor-pointer" title={checked ? "Sincronización Activada" : "Sincronización Desactivada"}>
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
        <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
    </label>
);

// Nuevo componente: Indicador de nuevas publicaciones
const NewPublicationsIndicator = ({ count, onRefresh }) => {
    if (count === 0) return null;
    
    return (
        <div className="mb-4 p-3 bg-green-900/50 border border-green-600 rounded-lg">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-green-200 font-semibold">
                        {count} nueva{count > 1 ? 's' : ''} publicación{count > 1 ? 'es' : ''} detectada{count > 1 ? 's' : ''}
                    </span>
                </div>
                <button 
                    onClick={onRefresh}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded hover:bg-green-700"
                >
                    Cargar nuevas publicaciones
                </button>
            </div>
        </div>
    );
};

const PublicationsView = () => {
    const { products, showMessage } = useContext(AppContext);
    const [publications, setPublications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [count, setCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [sortBy, setSortBy] = useState('title');
    const [zoomedImageUrl, setZoomedImageUrl] = useState(null);
    const [editingPublication, setEditingPublication] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    
    const [selectedPublications, setSelectedPublications] = useState(new Set());
    const [syncFilter, setSyncFilter] = useState('');
    const [selectAllAcrossPages, setSelectAllAcrossPages] = useState(false);
    
    // Estados para edición masiva
    const [bulkSafetyStock, setBulkSafetyStock] = useState('');
    const [isUpdatingBulk, setIsUpdatingBulk] = useState(false);
    
    // Estado para sincronización inmediata
    const [syncingItems, setSyncingItems] = useState(new Set());

    // NUEVO: Estado para auto-detección de publicaciones
    const [newPublicationsCount, setNewPublicationsCount] = useState(0);
    const [lastKnownCount, setLastKnownCount] = useState(0);
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

    // Calcular información del SKU actual
    const currentSKUInfo = useMemo(() => {
        if (!searchTerm.trim()) return null;
        
        const skuPublications = publications.filter(pub => 
            pub.sku && pub.sku.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (skuPublications.length > 0) {
            return {
                sku: skuPublications[0].sku,
                count: skuPublications.length,
                publications: skuPublications
            };
        }
        return null;
    }, [publications, searchTerm]);

    // NUEVA FUNCIÓN: Detectar nuevas publicaciones automáticamente
    const checkForNewPublications = async () => {
        if (!autoRefreshEnabled) return;
        
        try {
            const { count: currentCount } = await supabase
                .from('mercadolibre_listings')
                .select('*', { count: 'exact', head: true });
            
            if (currentCount > lastKnownCount && lastKnownCount > 0) {
                setNewPublicationsCount(currentCount - lastKnownCount);
            }
        } catch (error) {
            console.error('Error checking for new publications:', error);
        }
    };

    // NUEVA FUNCIÓN: Sincronizar nuevas publicaciones desde MercadoLibre
    const syncNewPublications = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase.functions.invoke('mercadolibre-sync-listings');
            if (error) throw error;
            
            showMessage(`Sincronización completada. ${data.count} publicaciones procesadas.`, 'success');
            setNewPublicationsCount(0);
            
            // Refrescar la lista actual
            await fetchPublications();
        } catch (error) {
            showMessage(`Error al sincronizar: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPublications = async () => {
        setIsLoading(true);
        const from = page * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        let query = supabase.from('mercadolibre_listings').select('*', { count: 'exact' });

        // CORREGIDO: Búsqueda por ID de MercadoLibre incluida
        if (searchTerm.trim()) {
            query = query.or(`title.ilike.%${searchTerm.trim()}%,sku.ilike.%${searchTerm.trim()}%,meli_id.ilike.%${searchTerm.trim()}%`);
        }
        if (statusFilter) query = query.eq('status', statusFilter);
        if (typeFilter) query = query.eq('listing_type_id', typeFilter);
        if (syncFilter !== '') query = query.eq('sync_enabled', syncFilter === 'true');

        if (sortBy === 'sold_quantity') {
            query = query.order('sold_quantity', { ascending: false, nullsFirst: false });
        } else {
            query = query.order('title', { ascending: true });
        }

        const { data, error, count: queryCount } = await query.range(from, to);
        
        if (error) {
            console.error("Error fetching publications:", error);
            setPublications([]);
        } else {
            const linkedData = data.map(pub => ({ ...pub, stock_reservado: products.find(p => p.sku === pub.sku)?.stock_reservado ?? 0 }));
            setPublications(linkedData);
            setCount(queryCount || 0);
            
            // Actualizar el último count conocido
            if (lastKnownCount === 0) {
                setLastKnownCount(queryCount || 0);
            }
        }
        setIsLoading(false);
    };

    useEffect(() => {
        const debounceTimeout = setTimeout(() => { fetchPublications(); }, 300);
        return () => clearTimeout(debounceTimeout);
    }, [page, products, searchTerm, statusFilter, typeFilter, sortBy, syncFilter]);

    // NUEVO: Auto-refresh para detectar nuevas publicaciones
    useEffect(() => {
        if (!autoRefreshEnabled) return;
        
        const interval = setInterval(checkForNewPublications, AUTO_REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [autoRefreshEnabled, lastKnownCount]);

    useEffect(() => {
        setPage(0);
        setSelectedPublications(new Set());
        setSelectAllAcrossPages(false);
    }, [searchTerm, statusFilter, typeFilter, sortBy, syncFilter]);
    
    const handleSelectPublication = (id, isSelected) => {
        const newSelection = new Set(selectedPublications);
        if (isSelected) newSelection.add(id);
        else newSelection.delete(id);
        setSelectedPublications(newSelection);
        setSelectAllAcrossPages(false);
    };

    const handleSelectAllOnPage = (e) => {
        if (e.target.checked) {
            setSelectedPublications(new Set(publications.map(p => p.id)));
        } else {
            setSelectedPublications(new Set());
            setSelectAllAcrossPages(false);
        }
    };

    const handleSelectAllBySKU = () => {
        if (currentSKUInfo) {
            const skuPublicationIds = currentSKUInfo.publications.map(pub => pub.id);
            setSelectedPublications(new Set(skuPublicationIds));
            showMessage(`Seleccionadas ${skuPublicationIds.length} publicaciones del SKU "${currentSKUInfo.sku}"`, 'success');
        }
    };

    const handleBulkSafetyStockUpdate = async () => {
        if (!bulkSafetyStock) {
            showMessage('Ingresa un valor para el stock de seguridad', 'error');
            return;
        }

        const safetyStockValue = parseInt(bulkSafetyStock) || 0;
        const totalToUpdate = selectAllAcrossPages ? count : selectedPublications.size;
        
        if (totalToUpdate === 0) {
            showMessage('No hay publicaciones seleccionadas', 'error');
            return;
        }

        if (!window.confirm(`¿Actualizar el stock de seguridad a ${safetyStockValue} para ${totalToUpdate} publicaciones y sincronizar inmediatamente con MercadoLibre?`)) {
            return;
        }

        setIsUpdatingBulk(true);
        try {
            if (selectAllAcrossPages) {
                const { error } = await supabase.functions.invoke('mercadolibre-bulk-update-safety-stock-immediate', {
                    body: {
                        filters: { searchTerm, statusFilter, typeFilter, syncFilter },
                        safetyStock: safetyStockValue
                    }
                });
                if (error) throw error;
                
                setPublications(pubs => pubs.map(p => ({ ...p, safety_stock: safetyStockValue })));
            } else {
                const selectedIds = Array.from(selectedPublications);
                const selectedPubs = publications.filter(p => selectedIds.includes(p.id));
                
                for (const pub of selectedPubs) {
                    await handleSafetyStockChange(pub.id, safetyStockValue, false);
                }
            }

            setSelectedPublications(new Set());
            setSelectAllAcrossPages(false);
            setBulkSafetyStock('');
            showMessage(`Stock de seguridad actualizado y sincronizado para ${totalToUpdate} publicaciones`, 'success');
        } catch (error) {
            showMessage(`Error en actualización masiva: ${error.message}`, 'error');
        } finally {
            setIsUpdatingBulk(false);
        }
    };
    
    const handleBulkAction = async (enableSync) => {
        const actionText = enableSync ? "activar" : "desactivar";
        const totalToUpdate = selectAllAcrossPages ? count : selectedPublications.size;

        if (totalToUpdate === 0) return;
        if (!window.confirm(`¿Estás seguro de que quieres ${actionText} la sincronización para ${totalToUpdate} publicaciones?`)) return;

        try {
            let error;
            if (selectAllAcrossPages) {
                const { error: functionError } = await supabase.functions.invoke('mercadolibre-bulk-update-sync', {
                    body: {
                        filters: { searchTerm, statusFilter, typeFilter, syncFilter },
                        enableSync
                    }
                });
                error = functionError;
            } else {
                const { error: updateError } = await supabase
                    .from('mercadolibre_listings')
                    .update({ sync_enabled: enableSync })
                    .in('id', Array.from(selectedPublications));
                error = updateError;
            }

            if (error) throw error;
            
            const updatedIds = Array.from(selectedPublications);
            setPublications(pubs => pubs.map(p => updatedIds.includes(p.id) ? { ...p, sync_enabled: enableSync } : p));
            
            setSelectedPublications(new Set());
            setSelectAllAcrossPages(false);
            showMessage(`${totalToUpdate} publicaciones se están actualizando en segundo plano.`, 'success');
        } catch (error) {
            showMessage(`Error en la acción masiva: ${error.message}`, 'error');
        }
    };
    
    const handleSyncToggle = async (publication) => {
        const newSyncState = !publication.sync_enabled;
        setPublications(pubs => pubs.map(p => p.id === publication.id ? { ...p, sync_enabled: newSyncState } : p));
        const { error } = await supabase.from('mercadolibre_listings').update({ sync_enabled: newSyncState }).eq('id', publication.id);
        if (error) {
            showMessage(`Error al cambiar estado: ${error.message}`, 'error');
            setPublications(pubs => pubs.map(p => p.id === publication.id ? { ...p, sync_enabled: !newSyncState } : p));
        }
    };
    
    const handleSafetyStockChange = async (publicationId, newSafetyStock, showMessageFlag = true) => {
        const currentPub = publications.find(p => p.id === publicationId);
        if (!currentPub) return;
        
        setSyncingItems(prev => new Set([...prev, publicationId]));
        
        setPublications(pubs => pubs.map(p => 
            p.id === publicationId ? { ...p, safety_stock: newSafetyStock } : p
        ));
        
        try {
            const { error: updateError } = await supabase
                .from('mercadolibre_listings')
                .update({ safety_stock: newSafetyStock })
                .eq('id', publicationId);
            
            if (updateError) throw updateError;

            const { data: syncData } = await supabase
                .from('sync_cache')
                .select('calculated_stock')
                .eq('sku', currentPub.sku)
                .single();

            if (syncData) {
                let newAvailableStock = Math.max(0, syncData.calculated_stock - newSafetyStock);
                
                if (currentPub.sku && currentPub.sku.includes('/X')) {
                    const multiplierMatch = currentPub.sku.match(/\/X(\d+)/);
                    if (multiplierMatch) {
                        const multiplier = parseInt(multiplierMatch[1]);
                        newAvailableStock = Math.floor(newAvailableStock / multiplier);
                    }
                }
                
                const shouldBeActive = newAvailableStock > 0;
                const currentlyActive = currentPub.status === 'active';
                let newStatus = currentPub.status;
                
                if (shouldBeActive !== currentlyActive) {
                    newStatus = shouldBeActive ? 'active' : 'paused';
                }
                
                const syncPayload = {
                    meliId: currentPub.meli_id,
                    variationId: currentPub.meli_variation_id,
                    availableQuantity: newAvailableStock,
                    sku: currentPub.sku
                };
                
                if (newStatus !== currentPub.status) {
                    syncPayload.status = newStatus;
                }
                
                const { error: syncError } = await supabase.functions.invoke('mercadolibre-update-single-item', {
                    body: syncPayload
                });
                
                if (syncError) throw syncError;
                
                setPublications(pubs => pubs.map(p => 
                    p.id === publicationId ? { 
                        ...p, 
                        safety_stock: newSafetyStock,
                        available_quantity: newAvailableStock,
                        status: newStatus
                    } : p
                ));
                
                if (showMessageFlag) {
                    const statusMsg = newStatus !== currentPub.status ? ` y ${newStatus === 'active' ? 'activada' : 'pausada'}` : '';
                    showMessage(`Stock de seguridad actualizado a ${newSafetyStock}. Stock disponible: ${newAvailableStock}${statusMsg}`, 'success');
                }
            }
            
        } catch (error) {
            if (showMessageFlag) {
                showMessage(`Error: ${error.message}`, 'error');
            }
            setPublications(pubs => pubs.map(p => 
                p.id === publicationId ? { ...p, safety_stock: currentPub?.safety_stock || 0 } : p
            ));
        } finally {
            setSyncingItems(prev => {
                const newSet = new Set(prev);
                newSet.delete(publicationId);
                return newSet;
            });
        }
    };
    
    const handleSavePublication = async ({ newPrice, newSku, newStock }) => {
        if (!editingPublication) return;
        setIsSaving(true);
        try {
            const updates = {};
            
            if (newPrice !== undefined && newPrice !== editingPublication.price) {
                updates.price = newPrice;
            }
            
            if (newSku !== undefined && newSku !== editingPublication.sku) {
                updates.sku = newSku;
            }
            
            if (newStock !== undefined && newStock !== editingPublication.available_quantity) {
                updates.availableQuantity = newStock;
            }
            
            if (Object.keys(updates).length > 0) {
                const { error } = await supabase.functions.invoke('mercadolibre-update-single-item', {
                    body: {
                        meliId: editingPublication.meli_id,
                        variationId: editingPublication.meli_variation_id,
                        ...updates
                    }
                });
                
                if (error) throw error;
                
                setPublications(pubs => pubs.map(p => 
                    p.id === editingPublication.id ? { 
                        ...p, 
                        price: newPrice !== undefined ? newPrice : p.price,
                        sku: newSku !== undefined ? newSku : p.sku,
                        available_quantity: newStock !== undefined ? newStock : p.available_quantity
                    } : p
                ));
                
                showMessage('Publicación actualizada con éxito en MercadoLibre', 'success');
            } else {
                showMessage('No hay cambios para sincronizar', 'info');
            }
            
            setEditingPublication(null);
        } catch (error) {
            showMessage(`Error al actualizar: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
    const isAllOnPageSelected = publications.length > 0 && selectedPublications.size === publications.length;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-white">Publicaciones de Mercado Libre</h2>
                
                {/* Control de auto-refresh */}
                <div className="flex items-center space-x-3">
                    <label className="flex items-center space-x-2 text-sm text-gray-300">
                        <input 
                            type="checkbox" 
                            checked={autoRefreshEnabled}
                            onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
                            className="w-4 h-4 bg-gray-700 border-gray-600 rounded"
                        />
                        <span>Auto-detectar nuevas publicaciones</span>
                    </label>
                    <button 
                        onClick={syncNewPublications}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                        title="Sincronizar manualmente con MercadoLibre"
                    >
                        Refrescar
                    </button>
                </div>
            </div>

            {/* Indicador de nuevas publicaciones */}
            <NewPublicationsIndicator 
                count={newPublicationsCount} 
                onRefresh={() => {
                    syncNewPublications();
                    setLastKnownCount(count + newPublicationsCount);
                }}
            />
            
            {/* FILTROS MEJORADOS */}
            <div className="mb-6 p-6 bg-gradient-to-r from-gray-900/80 to-gray-800/80 rounded-xl border border-gray-700/50 backdrop-blur-sm">
                <div className="relative mb-6">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                    </div>
                    <input 
                        type="text" 
                        placeholder="Buscar por ID de ML (MLA...), título o SKU..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="w-full pl-12 pr-4 py-3 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200"
                    />
                    {searchTerm && (
                        <button 
                            onClick={() => setSearchTerm('')}
                            className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    )}
                </div>
                
                {/* Información del SKU mejorada */}
                {currentSKUInfo && (
                    <div className="mb-6 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-lg backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                <span className="text-blue-200 font-medium">
                                    SKU "{currentSKUInfo.sku}" - {currentSKUInfo.count} publicaciones encontradas
                                </span>
                            </div>
                            <button 
                                onClick={handleSelectAllBySKU}
                                className="px-4 py-2 bg-blue-600/80 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-all duration-200 transform hover:scale-105"
                            >
                                Seleccionar todas ({currentSKUInfo.count})
                            </button>
                        </div>
                    </div>
                )}

                {/* Filtros en diseño de cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Estado */}
                    <div className="group">
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                            <svg className="w-4 h-4 text-gray-400 group-hover:text-green-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <span>Estado</span>
                        </label>
                        <select 
                            value={statusFilter} 
                            onChange={(e) => setStatusFilter(e.target.value)} 
                            className="w-full px-4 py-3 bg-gray-800/70 border border-gray-600/50 rounded-lg text-white focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all duration-200 hover:border-gray-500"
                        >
                            <option value="">Todos los estados</option>
                            <option value="active">Activas</option>
                            <option value="paused">Pausadas</option>
                            <option value="closed">Inactivas/Finalizadas</option>
                        </select>
                    </div>

                    {/* Tipo de Publicación */}
                    <div className="group">
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                            <svg className="w-4 h-4 text-gray-400 group-hover:text-yellow-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                            </svg>
                            <span>Tipo</span>
                        </label>
                        <select 
                            value={typeFilter} 
                            onChange={(e) => setTypeFilter(e.target.value)} 
                            className="w-full px-4 py-3 bg-gray-800/70 border border-gray-600/50 rounded-lg text-white focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all duration-200 hover:border-gray-500"
                        >
                            <option value="">Todos los tipos</option>
                            <option value="gold_special">Clásicas</option>
                            <option value="gold_pro">Premium</option>
                        </select>
                    </div>

                    {/* Estado de Sincronización */}
                    <div className="group">
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                            <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                            </svg>
                            <span>Sincronización</span>
                        </label>
                        <select 
                            value={syncFilter} 
                            onChange={(e) => setSyncFilter(e.target.value)} 
                            className="w-full px-4 py-3 bg-gray-800/70 border border-gray-600/50 rounded-lg text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 hover:border-gray-500"
                        >
                            <option value="">Todas</option>
                            <option value="true">En Sincro</option>
                            <option value="false">Fuera de Sincro</option>
                        </select>
                    </div>

                    {/* Ordenar por */}
                    <div className="group">
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                            <svg className="w-4 h-4 text-gray-400 group-hover:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4"></path>
                            </svg>
                            <span>Ordenar</span>
                        </label>
                        <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value)} 
                            className="w-full px-4 py-3 bg-gray-800/70 border border-gray-600/50 rounded-lg text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all duration-200 hover:border-gray-500"
                        >
                            <option value="title">Título (A-Z)</option>
                            <option value="sold_quantity">Más Vendidos</option>
                        </select>
                    </div>
                </div>

                {/* Indicadores de filtros activos */}
                {(searchTerm || statusFilter || typeFilter || syncFilter !== '' || sortBy !== 'title') && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        <span className="text-xs text-gray-400">Filtros activos:</span>
                        {searchTerm && (
                            <span className="px-3 py-1 bg-blue-600/20 border border-blue-600/30 rounded-full text-xs text-blue-300">
                                Búsqueda: "{searchTerm}"
                            </span>
                        )}
                        {statusFilter && (
                            <span className="px-3 py-1 bg-green-600/20 border border-green-600/30 rounded-full text-xs text-green-300">
                                Estado: {statusFilter}
                            </span>
                        )}
                        {typeFilter && (
                            <span className="px-3 py-1 bg-yellow-600/20 border border-yellow-600/30 rounded-full text-xs text-yellow-300">
                                Tipo: {typeFilter}
                            </span>
                        )}
                        {syncFilter !== '' && (
                            <span className="px-3 py-1 bg-purple-600/20 border border-purple-600/30 rounded-full text-xs text-purple-300">
                                Sincro: {syncFilter === 'true' ? 'Activa' : 'Inactiva'}
                            </span>
                        )}
                        {sortBy !== 'title' && (
                            <span className="px-3 py-1 bg-gray-600/20 border border-gray-600/30 rounded-full text-xs text-gray-300">
                                Orden: {sortBy}
                            </span>
                        )}
                        <button 
                            onClick={() => {
                                setSearchTerm('');
                                setStatusFilter('');
                                setTypeFilter('');
                                setSyncFilter('');
                                setSortBy('title');
                            }}
                            className="px-3 py-1 bg-red-600/20 border border-red-600/30 rounded-full text-xs text-red-300 hover:bg-red-600/30 transition-colors"
                        >
                            Limpiar filtros
                        </button>
                    </div>
                )}
            </div>
            
            {selectedPublications.size > 0 && (
                <div className="mb-4 p-4 bg-blue-900/50 border border-blue-700 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="text-white font-semibold">
                                {selectAllAcrossPages ? `Todas las ${count}` : selectedPublications.size} seleccionada(s)
                            </span>
                            {isAllOnPageSelected && !selectAllAcrossPages && count > publications.length && (
                                 <button onClick={() => setSelectAllAcrossPages(true)} className="ml-4 text-blue-300 hover:text-blue-100 font-bold text-sm">
                                    Seleccionar las {count} publicaciones que coinciden.
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-blue-600">
                        <div>
                            <label className="block text-sm text-gray-300 mb-2 font-medium">
                                Stock de Seguridad Masivo (Sincronización Inmediata)
                            </label>
                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    min="0"
                                    value={bulkSafetyStock}
                                    onChange={(e) => setBulkSafetyStock(e.target.value)}
                                    className="flex-1 px-3 py-2 bg-gray-600 text-white text-sm rounded border border-gray-500 focus:border-blue-400"
                                    placeholder="Ej: 5"
                                />
                                <button 
                                    onClick={handleBulkSafetyStockUpdate}
                                    disabled={isUpdatingBulk || !bulkSafetyStock}
                                    className="px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isUpdatingBulk ? 'Sincronizando...' : 'Aplicar y Sincronizar'}
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                Se aplicará y sincronizará inmediatamente con ML. Activará/pausará automáticamente.
                            </p>
                        </div>
                        
                        <div>
                            <label className="block text-sm text-gray-300 mb-2 font-medium">
                                Sincronización Masiva
                            </label>
                            <div className="flex gap-2">
                                <button onClick={() => handleBulkAction(true)} className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded hover:bg-green-700">
                                    Activar Sincro
                                </button>
                                <button onClick={() => handleBulkAction(false)} className="px-4 py-2 bg-yellow-600 text-white text-sm font-semibold rounded hover:bg-yellow-700">
                                    Desactivar Sincro
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex items-end">
                            <div className="text-sm text-gray-300">
                                <p>Publicaciones seleccionadas: <span className="font-semibold text-white">{selectAllAcrossPages ? count : selectedPublications.size}</span></p>
                                {currentSKUInfo && (
                                    <p className="text-xs text-blue-300">
                                        SKU activo: {currentSKUInfo.sku}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-gray-800 border border-gray-700 rounded-lg">
                <div className="p-4 flex items-center border-b border-gray-700">
                    <input type="checkbox" onChange={handleSelectAllOnPage} checked={isAllOnPageSelected} className="w-5 h-5 bg-gray-700 border-gray-600 rounded" />
                    <span className="ml-3 text-sm font-medium text-gray-300">Seleccionar todo en esta página</span>
                </div>
                {isLoading ? ( <p className="text-center p-8 text-gray-400">Cargando publicaciones...</p> ) : (
                    <div className="divide-y divide-gray-700">
                        {publications.map(pub => (
                            <div key={`${pub.meli_id}-${pub.meli_variation_id}`} className="flex items-center p-4 space-x-4">
                                <input type="checkbox" checked={selectedPublications.has(pub.id)} onChange={(e) => handleSelectPublication(pub.id, e.target.checked)} className="w-5 h-5 bg-gray-700 border-gray-600 rounded" />
                                {pub.thumbnail_url ? (
                                    <img src={pub.thumbnail_url} alt={pub.title} className={`w-16 h-16 object-cover rounded-md flex-shrink-0 ${pub.pictures && pub.pictures.length > 0 ? 'cursor-pointer hover:opacity-80' : ''}`}
                                        onClick={() => { if (pub.pictures && pub.pictures.length > 0) { setZoomedImageUrl(pub.pictures[0].url) } }}
                                    />
                                ) : ( <div className="w-16 h-16 bg-gray-700 rounded-md flex-shrink-0 flex items-center justify-center text-xs">Sin img</div> )}
                                <div className="flex-grow">
                                    <a href={pub.permalink} target="_blank" rel="noopener noreferrer" className="text-white font-semibold hover:underline">{pub.title}</a>
                                    <p className="text-xs text-gray-500 font-mono">ID: {pub.meli_id}</p>
                                    <p className="text-sm text-gray-400">SKU: {pub.sku || 'N/A'}</p>
                                    <div className="flex items-center space-x-2 mt-1"><StatusPill status={pub.status} /><ListingTypePill type={pub.listing_type_id} /></div>
                                </div>
                                <div className="text-right flex-shrink-0 w-48">
                                    <p className="text-white font-mono text-lg">${new Intl.NumberFormat('es-AR').format(pub.price)}</p>
                                    <p className="text-sm text-gray-400">Vendidos: <span className="font-semibold text-white">{pub.sold_quantity ?? 0}</span></p>
                                    <p className="text-sm text-gray-400">Disponible: <span className="font-semibold text-green-400">{pub.available_quantity}</span></p>
                                    <p className="text-sm text-gray-400">Reservado: <span className="font-semibold text-yellow-400">{pub.stock_reservado}</span></p>
                                    
                                    <div className="text-sm text-gray-400 flex items-center justify-end mt-1">
                                        <span className="mr-2">Seguridad:</span>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                min="0"
                                                value={pub.safety_stock || 0}
                                                onChange={(e) => handleSafetyStockChange(pub.id, parseInt(e.target.value) || 0)}
                                                disabled={syncingItems.has(pub.id)}
                                                className="w-16 px-2 py-1 bg-gray-600 text-white text-xs rounded border border-gray-500 focus:border-blue-400 focus:outline-none disabled:opacity-50"
                                                title="Stock de seguridad - se resta del stock disponible y sincroniza inmediatamente con ML"
                                            />
                                            {syncingItems.has(pub.id) && (
                                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-shrink-0 pl-2">
                                    <div className="flex items-center gap-3">
                                        <ToggleSwitch checked={pub.sync_enabled === null ? true : pub.sync_enabled} onChange={() => handleSyncToggle(pub)} />
                                        <button onClick={() => setEditingPublication(pub)} className="p-2 text-gray-400 hover:text-white" title="Editar SKU, Precio y Stock">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex justify-between items-center p-4 border-t border-gray-700">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || isLoading} className="px-4 py-2 bg-gray-600 rounded-lg">Anterior</button>
                    <span className="text-gray-400">Página {page + 1} de {totalPages > 0 ? totalPages : 1}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1 || isLoading} className="px-4 py-2 bg-gray-600 rounded-lg">Siguiente</button>
                </div>
            </div>

            <ImageZoomModal imageUrl={zoomedImageUrl} onClose={() => setZoomedImageUrl(null)} />
            {editingPublication && ( 
                <EditPublicationModal 
                    publication={editingPublication} 
                    onClose={() => setEditingPublication(null)} 
                    onSave={handleSavePublication} 
                    isSaving={isSaving}
                    allowStockEdit={true} 
                /> 
            )}
        </div>
    );
};

export default PublicationsView;