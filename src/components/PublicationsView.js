// Ruta: src/components/PublicationsView.js

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import ImageZoomModal from './ImageZoomModal';
import EditPublicationModal from './EditPublicationModal'; // Importamos el nuevo modal de edición

const ITEMS_PER_PAGE = 20;

// Componente para el estado de la publicación (sin cambios)
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

// Componente para el tipo de publicación (sin cambios)
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

    // Nuevos estados para la funcionalidad de edición
    const [editingPublication, setEditingPublication] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // useEffect para buscar publicaciones (sin cambios)
    useEffect(() => {
        const fetchPublications = async () => {
            setIsLoading(true);
            const from = page * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            let query = supabase
                .from('mercadolibre_listings')
                .select('*', { count: 'exact' });

            if (searchTerm.trim()) {
                const cleanedSearchTerm = searchTerm.trim().replace(/%/g, '');
                query = query.or(`title.ilike.%${cleanedSearchTerm}%,sku.ilike.%${cleanedSearchTerm}%,meli_id.ilike.%${cleanedSearchTerm}%`);
            }
            if (statusFilter) {
                query = query.eq('status', statusFilter);
            }
            if (typeFilter) {
                query = query.eq('listing_type_id', typeFilter);
            }
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
                const linkedData = data.map(pub => {
                    const product = products.find(p => p.sku === pub.sku);
                    return { ...pub, stock_reservado: product?.stock_reservado ?? 0 };
                });
                setPublications(linkedData);
                setCount(queryCount || 0);
            }
            setIsLoading(false);
        };
        
        const debounceTimeout = setTimeout(() => {
            fetchPublications();
        }, 300);

        return () => clearTimeout(debounceTimeout);
    }, [page, products, searchTerm, statusFilter, typeFilter, sortBy]);

    // useEffect para resetear la página (sin cambios)
    useEffect(() => {
        setPage(0);
    }, [searchTerm, statusFilter, typeFilter, sortBy]);
    
    // Nueva función para manejar el guardado de la publicación editada
    const handleSavePublication = async ({ newPrice, newSku }) => {
        if (!editingPublication) return;
        setIsSaving(true);
        try {
            const { error } = await supabase.functions.invoke('mercadolibre-update-publication', {
                body: {
                    publication: editingPublication,
                    newPrice,
                    newSku
                },
            });
            if (error) throw error;
            
            setPublications(pubs => pubs.map(p => 
                p.meli_id === editingPublication.meli_id && p.meli_variation_id === editingPublication.meli_variation_id
                ? { ...p, price: newPrice, sku: newSku } 
                : p
            ));

            showMessage('Publicación actualizada con éxito!', 'success');
            setEditingPublication(null);
        } catch (error) {
            showMessage(`Error al actualizar: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };


    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-6">Publicaciones de Mercado Libre</h2>
            
            {/* Filtros y Búsqueda (sin cambios) */}
            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg space-y-4">
                <input
                    type="text"
                    placeholder="Buscar por ID de ML, título o SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Selects de filtros */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Estado</label>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">Todos</option>
                            <option value="active">Activas</option>
                            <option value="paused">Pausadas</option>
                            <option value="closed">Inactivas/Finalizadas</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Tipo de Publicación</label>
                        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">Todos</option>
                            <option value="gold_special">Premium</option>
                            <option value="gold_pro">Clásica</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Ordenar por</label>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="title">Título (A-Z)</option>
                            <option value="sold_quantity">Más Vendidos</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div className="bg-gray-800 border border-gray-700 rounded-lg">
                {isLoading ? (
                    <p className="text-center p-8 text-gray-400">Cargando publicaciones...</p>
                ) : (
                    <div className="divide-y divide-gray-700">
                        {publications.length > 0 ? publications.map(pub => (
                            <div key={`${pub.meli_id}-${pub.meli_variation_id}`} className="flex items-center p-4 space-x-4">
                                {/* Bloque de Imagen (sin cambios) */}
                                {pub.thumbnail_url ? (
                                    <img src={pub.thumbnail_url} alt={pub.title} className={`w-16 h-16 object-cover rounded-md flex-shrink-0 ${pub.pictures && pub.pictures.length > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                                        onClick={() => { if (pub.pictures && pub.pictures.length > 0) { setZoomedImageUrl(pub.pictures[0].url) } }}
                                    />
                                ) : (
                                    <div className="w-16 h-16 bg-gray-700 rounded-md flex-shrink-0 flex items-center justify-center text-xs text-gray-500">Sin img</div>
                                )}
                                {/* Bloque de Título y SKU (sin cambios) */}
                                <div className="flex-grow">
                                    <a href={pub.permalink} target="_blank" rel="noopener noreferrer" className="text-white font-semibold hover:underline">{pub.title}</a>
                                    <p className="text-xs text-gray-500 font-mono">ID: {pub.meli_id}</p>
                                    <p className="text-sm text-gray-400">SKU: {pub.sku || 'No asignado'}</p>
                                    <div className="flex items-center space-x-2 mt-1">
                                        <StatusPill status={pub.status} />
                                        <ListingTypePill type={pub.listing_type_id} />
                                    </div>
                                </div>
                                {/* Bloque de Precios y Stock (sin cambios) */}
                                <div className="text-right flex-shrink-0 w-48">
                                    <p className="text-white font-mono text-lg">${new Intl.NumberFormat('es-AR').format(pub.price)}</p>
                                    <p className="text-sm text-gray-400">Vendidos: <span className="font-semibold text-white">{pub.sold_quantity ?? 0}</span></p>
                                    <p className="text-sm text-gray-400">Disponible: <span className="font-semibold text-green-400">{pub.available_quantity}</span></p>
                                    <p className="text-sm text-gray-400">Reservado: <span className="font-semibold text-yellow-400">{pub.stock_reservado}</span></p>
                                </div>
                                {/* **NUEVO** Bloque con el Botón de Editar */}
                                <div className="flex-shrink-0 pl-2">
                                    <button 
                                        onClick={() => setEditingPublication(pub)} 
                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
                                        title="Editar SKU y Precio"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg>
                                    </button>
                                </div>
                            </div>
                        )) : (
                            <p className="text-center p-8 text-gray-500">No se encontraron publicaciones que coincidan con los filtros.</p>
                        )}
                    </div>
                )}
                {/* Paginación (sin cambios) */}
                <div className="flex justify-between items-center p-4 border-t border-gray-700">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || isLoading} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 disabled:bg-gray-800 disabled:text-gray-500">
                        Anterior
                    </button>
                    <span className="text-gray-400">Página {page + 1} de {totalPages > 0 ? totalPages : 1}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1 || isLoading} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 disabled:bg-gray-800 disabled:text-gray-500">
                        Siguiente
                    </button>
                </div>
            </div>

            {/* Modal para Zoom de Imagen (sin cambios) */}
            <ImageZoomModal 
                imageUrl={zoomedImageUrl} 
                onClose={() => setZoomedImageUrl(null)} 
            />

            {/* **NUEVO** Modal para Edición */}
            {editingPublication && (
                <EditPublicationModal
                    publication={editingPublication}
                    onClose={() => setEditingPublication(null)}
                    onSave={handleSavePublication}
                    isSaving={isSaving}
                />
            )}
        </div>
    );
};

export default PublicationsView;