// Ruta: src/components/Integrations.js
import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

// --- COMPONENTE PARA MOSTRAR LAS PUBLICACIONES ---
const MeliListings = () => {
    const { showMessage, session, products } = useContext(AppContext);
    const [listings, setListings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncingItemId, setSyncingItemId] = useState(null);

    useEffect(() => {
        const fetchListings = async () => {
            if (!session) return;
            setIsLoading(true);
            const { data, error } = await supabase.from('meli_listings').select('*');

            if (error) {
                showMessage('Error al cargar las publicaciones: ' + error.message, 'error');
            } else if (data) {
                const linkedListings = data.map(listing => {
                    const product = products.find(p => p.sku === listing.sku);
                    return { ...listing, product_id: product?.id, prodflow_stock: product?.stock_disponible, prodflow_price: product?.sale_price };
                });
                setListings(linkedListings);
            }
            setIsLoading(false);
        };

        // Sincroniza las publicaciones tan pronto como el componente se monta
        handleFullSync(true); // true indica que es la carga inicial
    }, [session, products, showMessage]); // Se ejecuta cuando la sesión o los productos cambian


    const handleFullSync = async (isInitialSync = false) => {
        setIsSyncing(true);
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) throw new Error('No se pudo obtener la sesión del usuario.');

            const { error } = await supabase.functions.invoke('mercadolibre-sync-listings', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (error) throw error;
            
            if (!isInitialSync) {
                showMessage(`Sincronización completada.`, 'success');
            }
            // Después de sincronizar, volvemos a cargar las publicaciones desde nuestra BD
            const { data, error: fetchError } = await supabase.from('meli_listings').select('*');
            if(fetchError) throw fetchError;
            setListings(data || []);

        } catch (err) {
            showMessage(`Error al sincronizar: ${err.message}`, 'error');
        }
        setIsSyncing(false);
    };

    const handleSyncItem = async (listing) => {
        if (!listing.product_id) return showMessage('Este producto no está vinculado a ProdFlow.', 'error');
        setSyncingItemId(listing.id);
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) throw new Error('Sesión no válida.');
            const { data, error } = await supabase.functions.invoke('mercadolibre-update-stock', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
                body: { meli_id: listing.id, new_quantity: listing.prodflow_stock, new_price: listing.prodflow_price }
            });
            if (error) throw error;
            if (data.success) {
                showMessage(`"${listing.title}" actualizado en Mercado Libre.`, 'success');
                setListings(prev => prev.map(l => l.id === listing.id ? {...l, available_quantity: listing.prodflow_stock, price: listing.prodflow_price} : l));
            } else {
                throw new Error(data.error || 'Error desconocido al actualizar.');
            }
        } catch (err) {
            showMessage(`Error al sincronizar item: ${err.message}`, 'error');
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
                <button onClick={() => handleFullSync(false)} disabled={isSyncing} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600">
                    {isSyncing ? 'Sincronizando...' : 'Refrescar Publicaciones'}
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
                                 <tr key={listing.id}>
                                     <td className="px-4 py-3 font-medium text-white"><a href={listing.permalink} target="_blank" rel="noopener noreferrer" className="hover:underline">{listing.title}</a><div className="text-xs text-gray-500">{getLinkStatus(listing)}</div></td>
                                     <td className="px-4 py-3">{listing.sku || 'N/A'}</td>
                                     <td className="px-4 py-3 text-center font-mono">${listing.prodflow_price ?? 'N/A'} / ${listing.price}</td>
                                     <td className="px-4 py-3 text-center font-mono">{listing.prodflow_stock ?? 'N/A'} / {listing.available_quantity}</td>
                                     <td className="px-4 py-3 text-center"><button onClick={() => handleSyncItem(listing)} disabled={!listing.product_id || syncingItemId === listing.id} className="px-3 py-1 bg-teal-600 text-white text-xs font-semibold rounded-md shadow-sm hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed">{syncingItemId === listing.id ? '...' : 'Sincronizar'}</button></td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>
            )}
        </div>
    );
};


// --- COMPONENTE PRINCIPAL QUE MANEJA LA CONEXIÓN ---
const Integrations = () => {
    const { showMessage } = useContext(AppContext);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    const MELI_CLIENT_ID = process.env.REACT_APP_MELI_CLIENT_ID;
    const MELI_REDIRECT_URI = 'https://prodflow-jr.vercel.app';

    useEffect(() => {
        const handleAuthCallback = async (code) => {
            setIsProcessing(true);
            try {
                const { data, error } = await supabase.functions.invoke('mercadolibre-auth-callback', { body: { code } });
                
                // --- MEJORA: Leemos el error detallado que viene de la función ---
                if (error) throw error; // Si hay un error de red, lo lanzamos
                if (!data.success) {
                    // Si la función nos devuelve un error específico, lo lanzamos
                    throw new Error(data.error);
                }

                showMessage('¡Conectado a Mercado Libre con éxito!', 'success');
                setIsConnected(true);
                setIsProcessing(false);
                window.history.replaceState({}, document.title, window.location.pathname);

            } catch (err) {
                // Ahora el mensaje será mucho más útil, ej: "Error de Mercado Libre: invalid_grant - ..."
                showMessage(`Error al procesar la autorización: ${err.message}`, 'error');
                setIsProcessing(false);
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        };

        const checkInitialConnection = async () => {
            setIsLoading(true);
            const { data } = await supabase.from('meli_credentials').select('id').limit(1).single();
            setIsConnected(!!data);
            setIsLoading(false);
        };

        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        if (code && !isProcessing) {
            handleAuthCallback(code);
        } else {
            checkInitialConnection();
        }
    }, [showMessage, isProcessing]);


    const handleConnect = () => {
        if (!MELI_CLIENT_ID) {
            return showMessage('Error: REACT_APP_MELI_CLIENT_ID no está configurado en Vercel.', 'error');
        }
        const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${MELI_CLIENT_ID}&redirect_uri=${MELI_REDIRECT_URI}`;
        window.location.href = authUrl;
    };

    const handleDisconnect = async () => {
        if (window.confirm('¿Estás seguro? Esto eliminará las credenciales y las publicaciones sincronizadas.')) {
            setIsLoading(true);
            try {
                await supabase.from('meli_listings').delete().neq('id', 'dummy-id-to-delete-all');
                await supabase.from('meli_credentials').delete().eq('id', 1);
                showMessage('Cuenta de Mercado Libre desconectada.', 'success');
                setIsConnected(false);
            } catch (err) {
                showMessage(`Error al desconectar: ${err.message}`, 'error');
            }
            setIsLoading(false);
        }
    };

    if (isProcessing) {
        return (
            <div className="text-center p-8">
                <p className="text-xl font-semibold text-white">Procesando autorización, por favor espera...</p>
            </div>
        )
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-white">Integraciones</h2>
            </div>
            <div className="space-y-6">
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
                                        <span className="flex items-center text-green-400 bg-green-900/50 px-3 py-1 rounded-full text-sm font-semibold">Conectado</span>
                                        <button onClick={handleDisconnect} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700">Desconectar</button>
                                    </div>
                                ) : (
                                    <button onClick={handleConnect} className="px-4 py-2 bg-yellow-500 text-gray-900 font-semibold rounded-lg shadow-md hover:bg-yellow-600">Conectar</button>
                                )}
                        </div>
                    </div>
                    {isConnected && !isLoading && <MeliListings />}
                </div>
            </div>
        </div>
    );
};

export default Integrations;
