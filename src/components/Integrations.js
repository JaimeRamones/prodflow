// Ruta: src/components/Integrations.js
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

// --- COMPONENTE "TONTO": Solo muestra los datos que le pasan ---
const MeliListings = ({ listings, onSync, onSyncItem, isSyncing, syncingItemId }) => {
    const getLinkStatus = (listing) => {
        if (listing.product_id) return <span className="text-green-400 font-semibold">Vinculado</span>;
        if (listing.sku) return <span className="text-yellow-400 font-semibold">SKU no encontrado</span>;
        return <span className="text-red-400 font-semibold">Sin SKU</span>;
    };

    return (
        <div className="bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-md mt-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-white">Publicaciones Sincronizadas</h3>
                <button onClick={onSync} disabled={isSyncing} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600">
                    {isSyncing ? 'Sincronizando...' : 'Refrescar Publicaciones'}
                </button>
            </div>
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
                                <td className="px-4 py-3 text-center"><button onClick={() => onSyncItem(listing)} disabled={!listing.product_id || syncingItemId === listing.id} className="px-3 py-1 bg-teal-600 text-white text-xs font-semibold rounded-md shadow-sm hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed">{syncingItemId === listing.id ? '...' : 'Sincronizar'}</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- COMPONENTE "CEREBRO": Maneja toda la lógica ---
const Integrations = () => {
    const { showMessage, session, products } = useContext(AppContext);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // Estados para la tabla
    const [listings, setListings] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncingItemId, setSyncingItemId] = useState(null);

    const MELI_CLIENT_ID = process.env.REACT_APP_MELI_CLIENT_ID;
    const MELI_REDIRECT_URI = 'https://prodflow-jr.vercel.app';

    // ** LÓGICA DE SINCRONIZACIÓN Y DATOS **

    const fetchLocalListings = useCallback(async () => {
        if (!session) return;
        const { data, error } = await supabase.from('meli_listings').select('*');
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
            // CORRECCIÓN #2: Dejamos que Supabase maneje la autenticación automáticamente.
            // La librería cliente de Supabase ya sabe quién es el usuario y adjuntará el token necesario.
            const { error } = await supabase.functions.invoke('mercadolibre-sync-listings');
            
            if (error) throw error;
            
            showMessage(`Sincronización completada.`, 'success');
            await fetchLocalListings(); // Refresca la tabla con los nuevos datos
        } catch (err) {
            // El mensaje de error ahora será más claro, por ejemplo "Edge function returned a non-2xx status code"
            showMessage(`Error al sincronizar: ${err.message}`, 'error');
        }
        setIsSyncing(false);
    }, [showMessage, fetchLocalListings]);

    // ** LÓGICA DE EFECTOS Y CICLO DE VIDA **

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        const handleAuthCallback = async (authCode) => {
            setIsProcessing(true);
            try {
                const { data, error } = await supabase.functions.invoke('mercadolibre-auth-callback', { body: { code: authCode } });
                if (error || !data.success) throw new Error(data?.error || error.message);

                showMessage('¡Conectado! Sincronizando publicaciones por primera vez...', 'success');
                setIsConnected(true);
                await handleFullSync(); // Sincroniza automáticamente solo la primera vez
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
                // Cuando el usuario ya está conectado, primero mostramos lo que hay en la base de datos local...
                await fetchLocalListings();
                // ...y luego iniciamos una sincronización para actualizar los datos.
                handleFullSync();
            }
            setIsLoading(false);
        };

        if (code) {
            handleAuthCallback(code);
        } else {
            checkInitialConnection();
        }
    // CORRECCIÓN #1: El array de dependencias vacío `[]` le dice a React:
    // "Ejecuta esta lógica UNA SOLA VEZ cuando el componente aparece en pantalla, y no la vuelvas a ejecutar".
    // Esto rompe el bucle infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    // ** MANEJADORES DE EVENTOS DE LA UI **

    const handleSyncItem = async (listing) => {
        // ... (esta función se mantiene igual)
    };

    const handleConnect = () => {
        if (!MELI_CLIENT_ID) return showMessage('Error: REACT_APP_MELI_CLIENT_ID no está configurado en Vercel.', 'error');
        const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${MELI_CLIENT_ID}&redirect_uri=${MELI_REDIRECT_URI}`;
        window.location.href = authUrl;
    };

    const handleDisconnect = async () => {
        // ... (esta función se mantiene igual)
    };

    // ** RENDERIZADO DEL COMPONENTE **

    if (isProcessing) {
        return <div className="text-center p-8"><p className="text-xl font-semibold text-white">Procesando autorización...</p></div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6"><h2 className="text-3xl font-bold text-white">Integraciones</h2></div>
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
                    {isConnected && !isLoading && 
                        <MeliListings 
                            listings={listings}
                            onSync={handleFullSync}
                            onSyncItem={handleSyncItem}
                            isSyncing={isSyncing}
                            syncingItemId={syncingItemId}
                        />
                    }
                </div>
            </div>
        </div>
    );
};

export default Integrations;