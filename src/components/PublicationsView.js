// Ruta: src/components/PublicationsView.js

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const ITEMS_PER_PAGE = 20;

// Pequeños componentes para dar estilo a los estados
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

    useEffect(() => {
        const fetchPublications = async () => {
            setIsLoading(true);
            const from = page * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            // Obtenemos el total de publicaciones para la paginación
            const { count, error: countError } = await supabase
                .from('mercadolibre_listings')
                .select('*', { count: 'exact', head: true });
            
            if(countError) {
                console.error("Error counting publications:", countError);
                return;
            }
            setCount(count);

            // Obtenemos solo la página actual de publicaciones
            const { data, error } = await supabase
                .from('mercadolibre_listings')
                .select('*')
                .range(from, to)
                .order('title', { ascending: true });
            
            if (error) {
                console.error("Error fetching publications:", error);
                setPublications([]);
            } else {
                // Vinculamos la info de `products` (stock reservado)
                const linkedData = data.map(pub => {
                    const product = products.find(p => p.sku === pub.sku);
                    return { ...pub, stock_reservado: product?.stock_reservado ?? 0 };
                });
                setPublications(linkedData);
            }
            setIsLoading(false);
        };

        fetchPublications();
    }, [page, products]);

    const totalPages = Math.ceil(count / ITEMS_PER_PAGE);

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-6">Publicaciones de Mercado Libre</h2>
            
            <div className="bg-gray-800 border border-gray-700 rounded-lg">
                {isLoading ? (
                    <p className="text-center p-8 text-gray-400">Cargando publicaciones...</p>
                ) : (
                    <div className="divide-y divide-gray-700">
                        {publications.map(pub => (
                            <div key={pub.meli_id} className="flex items-center p-4 space-x-4">
                                {/* --- AQUÍ ESTÁ EL CAMBIO: Añadimos la imagen --- */}
                                <img src={pub.thumbnail_url} alt={pub.title} className="w-16 h-16 object-cover rounded-md flex-shrink-0" />
                                
                                <div className="flex-grow">
                                    <a href={pub.permalink} target="_blank" rel="noopener noreferrer" className="text-white font-semibold hover:underline">{pub.title}</a>
                                    <p className="text-sm text-gray-400">SKU: {pub.sku || 'No asignado'}</p>
                                    <div className="flex items-center space-x-2 mt-1">
                                        <StatusPill status={pub.status} />
                                        <ListingTypePill type={pub.listing_type_id} />
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0 w-48">
                                    <p className="text-white font-mono text-lg">${new Intl.NumberFormat('es-AR').format(pub.price)}</p>
                                    <p className="text-sm text-gray-400">Disponible: <span className="font-semibold text-green-400">{pub.available_quantity}</span></p>
                                    <p className="text-sm text-gray-400">Reservado: <span className="font-semibold text-yellow-400">{pub.stock_reservado}</span></p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                 {/* Controles de Paginación */}
                <div className="flex justify-between items-center p-4 border-t border-gray-700">
                    <button 
                        onClick={() => setPage(p => Math.max(0, p - 1))} 
                        disabled={page === 0 || isLoading}
                        className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 disabled:bg-gray-800 disabled:text-gray-500"
                    >
                        Anterior
                    </button>
                    <span className="text-gray-400">Página {page + 1} de {totalPages}</span>
                    <button 
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} 
                        disabled={page >= totalPages - 1 || isLoading}
                        className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-500 disabled:bg-gray-800 disabled:text-gray-500"
                    >
                        Siguiente
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PublicationsView;