// Ruta: src/components/PublicationsView.js

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import ImageZoomModal from './ImageZoomModal'; // 1. IMPORTAMOS EL NUEVO COMPONENTE

const ITEMS_PER_PAGE = 20;

// Pequeños componentes para dar estilo a los estados (sin cambios)
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


const PublicationsView = () => {
    const { products } = useContext(AppContext);
    const [publications, setPublications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [count, setCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [sortBy, setSortBy] = useState('title');
    
    // 2. AÑADIMOS EL ESTADO PARA LA IMAGEN AMPLIADA
    const [zoomedImageUrl, setZoomedImageUrl] = useState(null);

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

            // Asumo que la columna 'pictures' existe con la URL grande. Si no, ajusta esta línea.
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

    useEffect(() => {
        setPage(0);
    }, [searchTerm, statusFilter, typeFilter, sortBy]);

    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-6">Publicaciones de Mercado Libre</h2>
            
            <div className="mb-6 p-4 bg-gray-900/50 rounded-lg space-y-4">
                <input
                    type="text"
                    placeholder="Buscar por ID de ML, título o SKU..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Estado</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Todos</option>
                            <option value="active">Activas</option>
                            <option value="paused">Pausadas</option>
                            <option value="closed">Inactivas/Finalizadas</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Tipo de Publicación</label>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">Todos</option>
                            <option value="gold_special">Premium</option>
                            <option value="gold_pro">Clásica</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Ordenar por</label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
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
                          
                                  
                        {pub.thumbnail_url ? (
                       <img 
        src={pub.thumbnail_url} 
        alt={pub.title} 
        // El estilo de cursor y el efecto hover solo se aplican si se puede hacer zoom
        className={`w-16 h-16 object-cover rounded-md flex-shrink-0 ${pub.pictures && pub.pictures.length > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
        // La función onClick solo se ejecuta si existen los datos para el zoom
        onClick={() => {
            if (pub.pictures && pub.pictures.length > 0) {
                setZoomedImageUrl(pub.pictures[0].url);
            }
        }}
    />
) : (
    <div className="w-16 h-16 bg-gray-700 rounded-md flex-shrink-0 flex items-center justify-center text-xs text-gray-500">Sin img</div>
)}
    />
) : (
    <div className="w-16 h-16 bg-gray-700 rounded-md flex-shrink-0 flex items-center justify-center text-xs text-gray-500">Sin img</div>
)}
                                
                                <div className="flex-grow">
                                    <a href={pub.permalink} target="_blank" rel="noopener noreferrer" className="text-white font-semibold hover:underline">{pub.title}</a>
                                    <p className="text-xs text-gray-500 font-mono">ID: {pub.meli_id}</p>
                                    <p className="text-sm text-gray-400">SKU: {pub.sku || 'No asignado'}</p>
                                    <div className="flex items-center space-x-2 mt-1">
                                        <StatusPill status={pub.status} />
                                        <ListingTypePill type={pub.listing_type_id} />
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0 w-48">
                                    <p className="text-white font-mono text-lg">${new Intl.NumberFormat('es-AR').format(pub.price)}</p>
                                    <p className="text-sm text-gray-400">Vendidos: <span className="font-semibold text-white">{pub.sold_quantity ?? 0}</span></p>
                                    <p className="text-sm text-gray-400">Disponible: <span className="font-semibold text-green-400">{pub.available_quantity}</span></p>
                                    <p className="text-sm text-gray-400">Reservado: <span className="font-semibold text-yellow-400">{pub.stock_reservado}</span></p>
                                </div>
                            </div>
                        )) : (
                            <p className="text-center p-8 text-gray-500">No se encontraron publicaciones que coincidan con los filtros.</p>
                        )}
                    </div>
                )}
                <div className="flex justify-between items-center p-4 border-t border-gray-700">
                    <button 
                        onClick={() => setPage(p => Math.max(0, p - 1))} 
                        disabled={page === 0 || isLoading}
                        className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 disabled:bg-gray-800 disabled:text-gray-500"
                    >
                        Anterior
                    </button>
                    <span className="text-gray-400">Página {page + 1} de {totalPages > 0 ? totalPages : 1}</span>
                    <button 
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} 
                        disabled={page >= totalPages - 1 || isLoading}
                        className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 disabled:bg-gray-800 disabled:text-gray-500"
                    >
                        Siguiente
                    </button>
                </div>
            </div>

            {/* 4. RENDERIZAMOS EL MODAL */}
            <ImageZoomModal 
                imageUrl={zoomedImageUrl} 
                onClose={() => setZoomedImageUrl(null)} 
            />
        </div>
    );
};

export default PublicationsView;