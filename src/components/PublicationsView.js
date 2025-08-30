// Ruta: src/components/PublicationsView.js

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import ImageZoomModal from './ImageZoomModal';
import EditPublicationModal from './EditPublicationModal';

const ITEMS_PER_PAGE = 20;

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
        gold_special: 'bg-yellow-600 text-white',
        gold_pro: 'bg-amber-500 text-white',
        free: 'bg-gray-400 text-gray-900'
    };
     const text = {
        gold_special: 'Premium',
        gold_pro: 'Clásica',
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

    useEffect(() => {
        const fetchPublications = async () => {
            setIsLoading(true);
            const from = page * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            let query = supabase.from('mercadolibre_listings').select('*', { count: 'exact' });

            if (searchTerm.trim()) {
                query = query.or(`title.ilike.%${searchTerm.trim()}%,sku.ilike.%${searchTerm.trim()}%`);
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
            }
            setIsLoading(false);
        };
        
        const debounceTimeout = setTimeout(() => { fetchPublications(); }, 300);
        return () => clearTimeout(debounceTimeout);
    }, [page, products, searchTerm, statusFilter, typeFilter, sortBy, syncFilter]);

    useEffect(() => {
        setPage(0);
        setSelectedPublications(new Set());
    }, [searchTerm, statusFilter, typeFilter, sortBy, syncFilter]);
    
    const handleSelectPublication = (id, isSelected) => {
        const newSelection = new Set(selectedPublications);
        if (isSelected) newSelection.add(id);
        else newSelection.delete(id);
        setSelectedPublications(newSelection);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedPublications(new Set(publications.map(p => p.id)));
        } else {
            setSelectedPublications(new Set());
        }
    };
    
    const handleBulkAction = async (enableSync) => {
        if (selectedPublications.size === 0) return;
        const actionText = enableSync ? "activar" : "desactivar";
        if (!window.confirm(`¿Estás seguro de que quieres ${actionText} la sincronización para ${selectedPublications.size} publicaciones?`)) return;

        const { error } = await supabase.from('mercadolibre_listings').update({ sync_enabled: enableSync }).in('id', Array.from(selectedPublications));
        if (error) {
            showMessage(`Error en la acción masiva: ${error.message}`, 'error');
        } else {
            const updatedIds = Array.from(selectedPublications);
            setPublications(pubs => pubs.map(p => updatedIds.includes(p.id) ? { ...p, sync_enabled: enableSync } : p));
            setSelectedPublications(new Set());
            showMessage(`${selectedPublications.size} publicaciones actualizadas.`, 'success');
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
    
    const handleSavePublication = async ({ newPrice, newSku }) => { /* ... (código sin cambios) ... */ };
    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-6">Publicaciones de Mercado Libre</h2>
            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg space-y-4">
                <input type="text" placeholder="Buscar por ID de ML, título o SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Estado</label>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                            <option value="">Todos</option><option value="active">Activas</option><option value="paused">Pausadas</option><option value="closed">Inactivas/Finalizadas</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Tipo de Publicación</label>
                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                            <option value="">Todos</option><option value="gold_special">Premium</option><option value="gold_pro">Clásica</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Estado de Sincronización</label>
                        <select value={syncFilter} onChange={(e) => setSyncFilter(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                            <option value="">Todos</option>
                            <option value="true">En Sincro</option>
                            <option value="false">Fuera de Sincro</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Ordenar por</label>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                            <option value="title">Título (A-Z)</option><option value="sold_quantity">Más Vendidos</option>
                        </select>
                    </div>
                </div>
            </div>
            
            {selectedPublications.size > 0 && (
                <div className="mb-4 p-3 bg-blue-900/50 border border-blue-700 rounded-lg flex items-center justify-between">
                    <span className="text-white font-semibold">{selectedPublications.size} seleccionada(s)</span>
                    <div className="flex gap-2">
                        <button onClick={() => handleBulkAction(true)} className="px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700">Activar Sincro</button>
                        <button onClick={() => handleBulkAction(false)} className="px-3 py-1 bg-yellow-600 text-white text-sm font-semibold rounded-md hover:bg-yellow-700">Desactivar Sincro</button>
                    </div>
                </div>
            )}

            <div className="bg-gray-800 border border-gray-700 rounded-lg">
                <div className="p-4 flex items-center border-b border-gray-700">
                    <input type="checkbox" onChange={handleSelectAll} checked={publications.length > 0 && selectedPublications.size === publications.length} className="w-5 h-5 bg-gray-700 border-gray-600 rounded" />
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
                                </div>
                                <div className="flex-shrink-0 pl-2">
                                    <div className="flex items-center gap-3">
                                        <ToggleSwitch checked={pub.sync_enabled === null ? true : pub.sync_enabled} onChange={() => handleSyncToggle(pub)} />
                                        <button onClick={() => setEditingPublication(pub)} className="p-2 text-gray-400 hover:text-white" title="Editar SKU y Precio">
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
            {editingPublication && ( <EditPublicationModal publication={editingPublication} onClose={() => setEditingPublication(null)} onSave={handleSavePublication} isSaving={isSaving} /> )}
        </div>
    );
};

export default PublicationsView;