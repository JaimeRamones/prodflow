// Ruta: src/components/Integrations.js
import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

// --- COMPONENTE PARA MOSTRAR LAS PUBLICACIONES (Sin cambios) ---
const MeliListings = ({ listings, onSyncItem, syncingItemId }) => {
    const getLinkStatus = (listing) => {
        if (listing.product_id) return <span className="text-green-400 font-semibold">Vinculado</span>;
        if (listing.sku) return <span className="text-yellow-400 font-semibold">SKU no encontrado</span>;
        return <span className="text-red-400 font-semibold">Sin SKU</span>;
    };

    return (
        <div className="relative overflow-x-auto shadow-md sm:rounded-lg mt-4">
            <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                    <tr>
                        <th className="px-4 py-3">ID de ML</th>
                        <th className="px-4 py-3">Publicación</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3 text-center">Vendidos</th>
                        <th className="px-4 py-3 text-center">Stock (ProdFlow / ML)</th>
                        <th className="px-4 py-3 text-center">Precio (ProdFlow / ML)</th>
                        <th className="px-4 py-3 text-center">Acción</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {listings && listings.length > 0 ? (
                        listings.map(listing => (
                            <tr key={`${listing.meli_id}-${listing.meli_variation_id || ''}`}>
                                <td className="px-4 py-3 font-mono text-xs text-gray-500">{listing.meli_variation_id ? `${listing.meli_id}#${listing.meli_variation_id}` : listing.meli_id}</td>
                                <td className="px-4 py-3 font-medium text-white">
                                    <a href={listing.permalink} target="_blank" rel="noopener noreferrer" className="hover:underline">{listing.title}</a>
                                    <div className="text-xs text-gray-500">{getLinkStatus(listing)}</div>
                                </td>
                                <td className="px-4 py-3">{listing.sku || 'N/A'}</td>
                                <td className="px-4 py-3 text-center font-mono">{listing.sold_quantity ?? 0}</td>
                                <td className="px-4 py-3 text-center font-mono">{listing.prodflow_stock ?? 'N/A'} / {listing.available_quantity}</td>
                                <td className="px-4 py-3 text-center font-mono">${listing.prodflow_price ?? 'N/A'} / ${listing.price}</td>
                                <td className="px-4 py-3 text-center">
                                    <button onClick={() => onSyncItem(listing)} disabled={!listing.product_id || syncingItemId === listing.id} className="px-3 py-1 bg-teal-600 text-white text-xs font-semibold rounded-md shadow-sm hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
                                        {syncingItemId === listing.id ? '...' : 'Sincronizar'}
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="7" className="text-center py-8 text-gray-500">No se encontraron publicaciones.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};


// --- COMPONENTE PRINCIPAL CON LÓGICA ACTUALIZADA ---
const Integrations = () => {
    const { showMessage, session, products } = useContext(AppContext);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [listings, setListings] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncingItemId, setSyncingItemId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

    const fetchLocalListings = useCallback(async () => {
        if (!session) return;
        const { data, error } = await supabase.from('mercadolibre_listings').select('*').order('title', { ascending: true });
        if (error) {
            showMessage('Error al cargar publicaciones locales: ' + error.message, 'error');
        } else if (data) {
            const linkedListings = data.map(listing => {
                const product = products.find(p => p.sku === listing.sku);
                return { ...listing, product_id: product?.id, prodflow_stock: product?.stock_disponible, prodflow_price: product?.sale_price };
            });
            setListings(linkedListings);
        }
    }, [session, products, showMessage]);
    
    const handleFullSync = useCallback(async () => {
        setIsSyncing(true);
        try {
            const { data, error } = await supabase.functions.invoke('mercadolibre-sync-listings');
            if (error) throw error;
            showMessage(`Sincronización completada. Se procesaron ${data.count} publicaciones.`, 'success');
            await fetchLocalListings();
        } catch (err) {
            showMessage(`Error al sincronizar: ${err.message}`, 'error');
        }
        setIsSyncing(false);
    }, [showMessage, fetchLocalListings]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        const handleAuthCallback = async (authCode) => {
            setIsProcessing(true);
            try {
                const { error } = await supabase.functions.invoke('mercadolibre-auth-callback', { body: { code: authCode } });
                if (error) throw error;
                showMessage('¡Conectado! Sincronizando publicaciones por primera vez...', 'success');
                setIsConnected(true);
                await handleFullSync();
            } catch (err) {
                showMessage(`Error al procesar la autorización: ${err.message}`, 'error');
            } finally {
                setIsProcessing(false);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        };

        const checkInitialConnection = async () => {
            setIsLoading(true);
            const { data } = await supabase.from('meli_credentials').select('id').limit(1).single();
            if (data) {
                setIsConnected(true);
                await fetchLocalListings();
            }
            setIsLoading(false);
        };

        if (code) {
            handleAuthCallback(code);
        } else {
            checkInitialConnection();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filteredListings = useMemo(() => {
        if (!searchTerm.trim()) {
            return listings;
        }
        const lowercasedTerm = searchTerm.toLowerCase();
        return listings.filter(listing =>
            listing.title.toLowerCase().includes(lowercasedTerm) ||
            (listing.sku && listing.sku.toLowerCase().includes(lowercasedTerm)) ||
            (listing.meli_id && listing.meli_id.toLowerCase().includes(lowercasedTerm))
        );
    }, [searchTerm, listings]);

    const handleSyncItem = async (listing) => { /* Lógica futura */ };

    const handleConnect = () => {
        const clientId = process.env.REACT_APP_MELI_CLIENT_ID;
        if (!clientId) return showMessage('Error: REACT_APP_MELI_CLIENT_ID no está configurado.', 'error');
        
        // **AQUÍ ESTÁ LA CORRECCIÓN**
        const redirectUri = window.location.origin + '/app';
        
        const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
        window.location.href = authUrl;
    };

    const handleDisconnect = async () => {
        setIsProcessing(true);
        try {
            await supabase.from('meli_credentials').delete().eq('user_id', session.user.id);
            await supabase.from('mercadolibre_listings').delete().eq('user_id', session.user.id);
            showMessage('Cuenta de Mercado Libre desconectada.', 'success');
            setIsConnected(false);
            setListings([]);
        } catch (err) {
            showMessage(`Error al desconectar: ${err.message}`, 'error');
        } finally {
            setConfirmingDisconnect(false);
            setIsProcessing(false);
        }
    };

    if (isProcessing) {
        return <div className="text-center p-8"><p className="text-xl font-semibold text-white">Procesando autorización...</p></div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6"><h2 className="text-3xl font-bold text-white">Integraciones</h2></div>
            <div className="space-y-6">
                <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <img src="https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/5.21.1/mercadolibre/logo__large_plus.png" alt="Mercado Libre" className="h-8 bg-white p-1 rounded"/>
                            <div>
                                <h3 className="text-xl font-semibold text-white">Mercado Libre</h3>
                                <p className="text-gray-400 mt-1">{isConnected ? 'Tu cuenta está conectada.' : 'Sincroniza tu inventario y gestiona tus pedidos.'}</p>
                            </div>
                        </div>
                        <div className="w-full sm:w-auto">
                            {isLoading ? <p className="text-gray-400">Verificando...</p> :
                                isConnected ? (
                                    confirmingDisconnect ? (
                                        <div className="flex items-center justify-end space-x-2">
                                            <span className="text-sm text-yellow-400">¿Seguro?</span>
                                            <button onClick={handleDisconnect} disabled={isProcessing} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-3 rounded-lg transition-colors disabled:opacity-50">
                                                {isProcessing ? '...' : 'Sí, Desconectar'}
                                            </button>
                                            <button onClick={() => setConfirmingDisconnect(false)} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg transition-colors">
                                                No
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setConfirmingDisconnect(true)} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 w-full">
                                            Desconectar
                                        </button>
                                    )
                                ) : (
                                    <button onClick={handleConnect} className="px-4 py-2 bg-yellow-500 text-gray-900 font-semibold rounded-lg shadow-md hover:bg-yellow-600 w-full">
                                        Conectar
                                    </button>
                                )}
                        </div>
                    </div>
                    {isConnected && !isLoading && (
                        <div className="mt-6 pt-6 border-t border-gray-700">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-semibold text-white">Publicaciones Sincronizadas</h3>
                                <button onClick={handleFullSync} disabled={isSyncing} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600">
                                    {isSyncing ? 'Sincronizando...' : 'Refrescar Publicaciones'}
                                </button>
                            </div>
                            <div className="mb-4">
                                <input
                                    type="text"
                                    placeholder="Buscar por ID, título o SKU..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <MeliListings 
                                listings={filteredListings}
                                onSyncItem={handleSyncItem}
                                syncingItemId={syncingItemId}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Integrations;
