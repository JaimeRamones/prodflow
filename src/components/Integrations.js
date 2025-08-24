import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const MeliListings = () => {
    const { showMessage, session, products } = useContext(AppContext);
    const [listings, setListings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncingItemId, setSyncingItemId] = useState(null);

    const fetchListings = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('mercadolibre_listings').select('*').eq('user_id', session.user.id).order('title', { ascending: true });

        if (error) {
            showMessage('Error al cargar las publicaciones.', 'error');
        } else {
            const linkedListings = data.map(listing => {
                const product = products.find(p => p.sku === listing.sku);
                return { 
                    ...listing, product_id: product?.id, 
                    prodflow_stock: product?.stock_disponible,
                    prodflow_price: product?.sale_price
                };
            });
            setListings(linkedListings);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        if (session && products && products.length > 0) {
            fetchListings();
        }
    }, [session, products]);

    const handleFullSync = async () => {
        setIsSyncing(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Sesión no válida.");

            const { error } = await supabase.functions.invoke('mercadolibre-sync-listings', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            // --- CAMBIO: Detectamos el error de token ---
            if (error) {
                // Si el error tiene un status 401, es nuestro error de token
                if (error.context?.status === 401) {
                    throw new Error("TOKEN_INVALID"); // Lanzamos nuestro error personalizado
                }
                throw error; // Lanzamos otros errores normalmente
            }

            showMessage(`Sincronización iniciada con éxito.`, 'success');
            await fetchListings();

        } catch (err) {
            // --- CAMBIO: Mostramos el mensaje amigable ---
            if (err.message === "TOKEN_INVALID") {
                showMessage('Tu conexión con Mercado Libre ha expirado. Por favor, vuelve a conectarte.', 'error');
            } else {
                showMessage(`Error al sincronizar: ${err.message}`, 'error');
            }
        }
        setIsSyncing(false);
    };
    
    const handleSyncItem = async (listing) => {
        if (!listing.product_id) {
            showMessage('Este producto no está vinculado a ProdFlow.', 'error');
            return;
        }
        setSyncingItemId(listing.meli_id);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("Sesión no válida.");

            const { data, error } = await supabase.functions.invoke('mercadolibre-update-stock', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
                body: {
                    meli_id: listing.meli_id,
                    new_quantity: listing.prodflow_stock,
                    new_price: listing.prodflow_price
                }
            });

            if (error) {
                 if (error.context?.status === 401) {
                    throw new Error("TOKEN_INVALID");
                }
                throw error;
            }

            if (data.success) {
                showMessage(`"${listing.title}" actualizado en Mercado Libre.`, 'success');
                setListings(prev => prev.map(l => 
                    l.meli_id === listing.meli_id 
                    ? { ...l, available_quantity: data.updated_quantity, price: data.updated_price } 
                    : l
                ));
            } else {
                throw new Error(data.error || 'Error desconocido al actualizar.');
            }
        } catch (err) {
             if (err.message === "TOKEN_INVALID") {
                showMessage('Tu conexión con Mercado Libre ha expirado. Por favor, vuelve a conectarte.', 'error');
            } else {
                showMessage(`Error al sincronizar: ${err.message}`, 'error');
            }
        }
        setSyncingItemId(null);
    };

    const getLinkStatus = (listing) => {
        if (listing.product_id) return <span className="text-green-400 font-semibold">Vinculado</span>;
        if (listing.sku) return <span className="text-yellow-400 font-semibold">SKU no encontrado</span>;
        return <span className="text-red-400 font-semibold">Sin SKU</span>;
    };

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md mt-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">Publicaciones Sincronizadas</h3>
                <button onClick={handleFullSync} disabled={isSyncing} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600">
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Publicaciones'}
                </button>
            </div>
            {isLoading ? <p className="text-gray-400">Cargando publicaciones...</p> : (
                 <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                            <tr>
                                <th className="px-4 py-3">Publicación</th>
                                <th className="px-4 py-3">SKU</th>
                                <th className="px-4 py-3 text-center">Precio (ProdFlow / ML)</th>
                                <th className="px-4 py-3 text-center">Stock (ProdFlow / ML)</th>
                                <th className="px-4 py-3 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {listings.map(listing => (
                                <tr key={listing.meli_id}>
                                    <td className="px-4 py-3 font-medium text-white">
                                        <a href={listing.permalink} target="_blank" rel="noopener noreferrer" className="hover:underline">{listing.title}</a>
                                        <div className="text-xs text-gray-500">{getLinkStatus(listing)}</div>
                                    </td>
                                    <td className="px-4 py-3">{listing.sku || 'N/A'}</td>
                                    <td className="px-4 py-3 text-center font-mono">
                                        ${listing.prodflow_price ?? 'N/A'} / ${listing.price}
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono">
                                        {listing.prodflow_stock ?? 'N/A'} / {listing.available_quantity}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button 
                                            onClick={() => handleSyncItem(listing)}
                                            disabled={!listing.product_id || syncingItemId === listing.meli_id}
                                            className="px-3 py-1 bg-teal-600 text-white text-xs font-semibold rounded-md shadow-sm hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                                        >
                                            {syncingItemId === listing.meli_id ? '...' : 'Sincronizar'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const MercadoLibreIntegration = () => {
    const { session, showMessage } = useContext(AppContext);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // No olvides poner tus variables reales aquí
    const MELI_APP_ID = '322796455561380'; 
    const MELI_REDIRECT_URI = 'https://88c04c33df3d.ngrok-free.app'; 

    useEffect(() => {
        const handleAuthCallback = async (code) => {
            setIsProcessing(true);
            try {
                const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
                if (sessionError || !session) throw new Error("No se pudo validar la sesión del usuario.");
                
                const { data, error } = await supabase.functions.invoke('mercadolibre-auth-callback', {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }, body: { code }
                });

                if (error) throw error;
                if (data.success) {
                    showMessage('¡Conectado a Mercado Libre con éxito!', 'success');
                    window.location.href = window.location.pathname;
                } else {
                    throw new Error(data.error || 'Ocurrió un error desconocido.');
                }
            } catch (err) {
                showMessage(`Error al procesar la autorización: ${err.message}`, 'error');
                setIsProcessing(false);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        };

        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code && !isProcessing) {
            handleAuthCallback(code);
        } else {
            const checkConnection = async () => {
                if (!session) return;
                setIsLoading(true);
                const { data } = await supabase
                    .from('mercadolibre_tokens').select('user_id').eq('user_id', session.user.id).single();
                
                setIsConnected(!!data);
                setIsLoading(false);
            };
            checkConnection();
        }
    }, [session, showMessage, isProcessing]);

    const handleConnect = () => {
        const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${MELI_APP_ID}&redirect_uri=${MELI_REDIRECT_URI}`;
        window.location.href = authUrl;
    };
    
    const handleDisconnect = async () => {
        if (window.confirm('¿Estás seguro de que quieres desconectar tu cuenta de Mercado Libre?')) {
            try {
                const { error } = await supabase.from('mercadolibre_tokens').delete().eq('user_id', session.user.id);
                if (error) throw error;
                showMessage('Cuenta de Mercado Libre desconectada.', 'success');
                setIsConnected(false);
            } catch (err) {
                 showMessage(`Error al desconectar: ${err.message}`, 'error');
            }
        }
    };

    if (isProcessing) {
        return (
             <div className="text-center p-8 bg-gray-800 rounded-lg">
                <p className="text-xl font-semibold text-white">Procesando autorización...</p>
            </div>
        )
    }

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-semibold text-white">Mercado Libre</h3>
                    <p className="text-gray-400 mt-1">Sincroniza tu inventario y gestiona tus pedidos.</p>
                </div>
                <div className="flex items-center">
                    {isLoading ? <p className="text-gray-400">Verificando...</p> : 
                     isConnected ? (
                        <div className="flex items-center gap-4">
                             <span className="flex items-center text-green-400 bg-green-900/50 px-3 py-1 rounded-full text-sm font-semibold">
                                Conectado
                            </span>
                            <button onClick={handleDisconnect} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700">
                                Desconectar
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleConnect} className="px-4 py-2 bg-yellow-500 text-gray-900 font-semibold rounded-lg shadow-md hover:bg-yellow-600">
                            Conectar
                        </button>
                    )}
                </div>
            </div>
            {isConnected && <MeliListings />}
        </div>
    );
};

const Integrations = () => {
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-white">Integraciones</h2>
            </div>
            <div className="space-y-6">
                <MercadoLibreIntegration />
            </div>
        </div>
    );
};

export default Integrations;