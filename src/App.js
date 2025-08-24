import React, { useState, useEffect, useContext, createContext } from 'react';
import { supabase } from './supabaseClient';

// Importaciones de Componentes - ¡ESTAS SON LAS LÍNEAS QUE FALTABAN!
import Dashboard from './components/Dashboard';
import InventoryList from './components/InventoryList';
import ProductEntry from './components/ProductEntry';
import SalesView from './components/SalesView';
import OrdersManagement from './components/OrdersManagement';
import WarehouseView from './components/WarehouseView';
import Kits from './components/Kits';
import MovementHistory from './components/MovementHistory';
import Tools from './components/Tools';
import Integrations from './components/Integrations';
import PublicationsView from './components/PublicationsView';
import LoginScreen from './components/LoginScreen';
import Notification from './components/Notification';
import EditProductModal from './components/EditProductModal';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';
import CreatePublicationModal from './components/CreatePublicationModal';


// Icono genérico para la barra lateral
const Icon = ({ path }) => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={path}></path>
    </svg>
);

// Contexto Global de la Aplicación
export const AppContext = createContext();

const AppProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [categories, setCategories] = useState([]);
    const [kits, setKits] = useState([]);
    const [salesOrders, setSalesOrders] = useState([]);
    const [supplierOrders, setSupplierOrders] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [notification, setNotification] = useState({ show: false, message: '', type: '' });

    const showMessage = (message, type = 'info') => {
        setNotification({ show: true, message, type });
    };

    // Manejo de la sesión de Supabase
    useEffect(() => {
        // Aunque usamos SessionContextProvider en index.js, también verificamos la sesión aquí para el estado del Provider.
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });
        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
        return () => {
            if (authListener && authListener.subscription) {
                authListener.subscription.unsubscribe();
            }
        };
    }, []);
    
    // Funciones para refrescar datos desde Supabase
    const fetchProducts = async () => {
        const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error("Error REAL al buscar productos:", error);
            showMessage('Error al refrescar los productos.', 'error');
        } else {
            setProducts(data);
        }
    };
    const fetchSuppliers = async () => {
        const { data, error } = await supabase.from('suppliers').select('*').order('name', { ascending: true });
        if (error) {
            console.error("Error REAL al buscar proveedores:", error);
            showMessage('Error al refrescar los proveedores.', 'error');
        } else {
            setSuppliers(data);
        }
    };
    const fetchCategories = async () => {
        const { data, error } = await supabase.from('categories').select('*').order('name', { ascending: true });
        if (error) {
            console.error("Error REAL al buscar categorías:", error);
            showMessage('Error al refrescar las categorías.', 'error');
        } else {
            setCategories(data);
        }
    };

    // (Mantenemos el resto de los fetchers como estaban)
    const fetchSalesOrders = async () => {
        const { data, error } = await supabase.from('sales_orders').select(`*, order_items ( * )`).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos de venta.', 'error'); } else { setSalesOrders(data); }
    };
    const fetchSupplierOrders = async () => {
        const { data, error } = await supabase.from('supplier_orders').select(`*`).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos a proveedor.', 'error'); } else { setSupplierOrders(data); }
    };
    const fetchPurchaseOrders = async () => {
        const { data, error } = await supabase.from('purchase_orders').select(`*`).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar órdenes de compra.', 'error'); } else { setPurchaseOrders(data); }
    };
    const fetchKits = async () => {
        const { data, error } = await supabase.from('kits').select(`*, components:kit_components(*)`).order('name', { ascending: true });
        if (error) showMessage('Error al cargar los kits.', 'error'); else setKits(data);
    };

    // Carga inicial de datos cuando el usuario inicia sesión
    useEffect(() => {
        if (session && session.user) {
            const fetchData = async () => {
                // Usamos Promise.all para cargar datos en paralelo y más rápido
                await Promise.all([
                    fetchSuppliers(),
                    fetchCategories(),
                    fetchProducts(),
                    fetchSalesOrders(),
                    fetchSupplierOrders(),
                    fetchPurchaseOrders(),
                    // fetchKits() // Descomentar cuando esté listo
                ]);
            };
            fetchData();
        }
    // Usamos session?.user?.id para asegurarnos de que solo se ejecute cuando el usuario esté completamente autenticado
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]);
    
    const value = { 
        session, loading, showMessage, 
        products, suppliers, categories, kits, salesOrders, supplierOrders, purchaseOrders,
        notification, setNotification, 
        fetchSuppliers, fetchCategories, fetchProducts, fetchKits, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders 
    };
    
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};


// Componente principal de la interfaz (barra lateral y contenido)
const AppContent = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [productToEdit, setProductToEdit] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState(null);
    const [productToPublish, setProductToPublish] = useState(null);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

    const { showMessage, notification, setNotification, fetchProducts } = useContext(AppContext);

    // Manejadores de acciones
    const handleEdit = (product) => { setProductToEdit(product); setIsEditModalOpen(true); };
    const handlePublish = (product) => { setProductToPublish(product); setIsPublishModalOpen(true); };

    const handleSave = async (editedProduct) => {
        try {
            const { id, ...dataToUpdate } = editedProduct;
            
            // Limpieza básica de datos antes de enviar: eliminamos campos que no deben actualizarse
            delete dataToUpdate.created_at; 

            const { error } = await supabase.from('products').update(dataToUpdate).eq('id', id);
            if (error) throw error;
            showMessage("Producto actualizado con éxito.", "success");
            setIsEditModalOpen(false);
            await fetchProducts(); // Refrescar la lista
        } catch (error) { showMessage(`Error al guardar cambios: ${error.message}`, 'error'); }
    };

    const handleDeleteConfirm = async () => {
        if (!productToDelete) return;
        try {
            const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
            if (error) throw error;
            showMessage(`Producto ${productToDelete.sku} eliminado con éxito.`, 'success');
            await fetchProducts(); // Refrescar la lista
        } catch (error) { showMessage(`Error al eliminar el producto: ${error.message}`, 'error'); }
        finally { setProductToDelete(null); }
    };
    
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { showMessage("Error al cerrar sesión: " + error.message, 'error'); }
    };

    // Renderizado condicional de las pestañas
    const renderActiveTab = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard />;
            case 'inventory': return <InventoryList onEdit={handleEdit} onDelete={setProductToDelete} onPublish={handlePublish} />;
            case 'entry': return <ProductEntry />;
            case 'sales': return <SalesView />;
            case 'orders': return <OrdersManagement />;
            case 'warehouse': return <WarehouseView />;
            case 'kits': return <Kits />;
            case 'history': return <MovementHistory />;
            case 'tools': return <Tools />;
            case 'integrations': return <Integrations />;
            case 'publications': return <PublicationsView />;
            default: return <Dashboard />;
        }
    };

    // Componente reutilizable para los botones de navegación
    const NavButton = ({ tabName, iconPath, children }) => (
        <li>
            <button
                onClick={() => setActiveTab(tabName)}
                className={`flex items-center w-full p-2 text-base font-normal rounded-lg transition duration-75 group ${
                    activeTab === tabName
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
            >
                <Icon path={iconPath} />
                <span className="flex-1 ml-3 whitespace-nowrap">{children}</span>
            </button>
        </li>
    );
    
    return (
        <div className="bg-gray-900 text-gray-300 min-h-screen">
            {/* Notificación Global */}
            {notification.show && (
                <Notification
                    message={notification.message}
                    type={notification.type}
                    onClose={() => setNotification({ show: false, message: '', type: '' })}
                />
            )}

            {/* Barra Lateral (Sidebar) */}
            <aside className="fixed top-0 left-0 z-40 w-64 h-screen transition-transform bg-gray-800 border-r border-gray-700 sm:translate-x-0">
                <div className="h-full px-3 py-4 overflow-y-auto bg-gray-800">
                    <div className="flex items-center pl-2.5 mb-5">
                        <span className="self-center text-xl font-semibold whitespace-nowrap text-white ml-3">ProdFlow</span>
                    </div>
                    <ul className="space-y-2">
                         {/* Botones de Navegación Principales */}
                        <NavButton tabName="dashboard" iconPath="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z">Dashboard</NavButton>
                        <NavButton tabName="inventory" iconPath="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4">Inventario</NavButton>
                        <NavButton tabName="entry" iconPath="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1">Entrada</NavButton>
                        <NavButton tabName="sales" iconPath="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z">Ventas</NavButton>
                        <NavButton tabName="orders" iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01">Pedidos</NavButton>
                        <NavButton tabName="warehouse" iconPath="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h6m-6 4h6m-6 4h6">Depósito</NavButton>
                        <NavButton tabName="kits" iconPath="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 18h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z">Kits</NavButton>
                        <NavButton tabName="history" iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z">Historial</NavButton>
                    </ul>
                    <ul className="pt-4 mt-4 space-y-2 border-t border-gray-700">
                        {/* Botones de Navegación Secundarios */}
                        <NavButton tabName="tools" iconPath="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z">Herramientas</NavButton>
                        <NavButton tabName="integrations" iconPath="M13 10V3L4 14h7v7l9-11h-7z">Integraciones</NavButton>
                        <NavButton tabName="publications" iconPath="M3 10h18M3 14h18M3 6h18">Publicaciones</NavButton>
                        
                        {/* Botón de Cerrar Sesión */}
                        <li>
                            <button onClick={handleLogout} className="flex items-center w-full p-2 text-base font-normal text-gray-400 rounded-lg transition duration-75 group hover:bg-red-800 hover:text-white">
                                <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                <span className="flex-1 ml-3 whitespace-nowrap">Cerrar Sesión</span>
                            </button>
                        </li>
                    </ul>
                </div>
            </aside>

            {/* Contenido Principal */}
            <main className="p-4 sm:ml-64">
                {/* Se añade un margen superior por si acaso */}
                <div className="mt-14"> 
                    {renderActiveTab()}
                </div>
            </main>

            {/* Modales Globales */}
            {isEditModalOpen && <EditProductModal product={productToEdit} onClose={() => setIsEditModalOpen(false)} onSave={handleSave} />}
            {productToDelete && <ConfirmDeleteModal item={productToDelete} onCancel={() => setProductToDelete(null)} onConfirm={handleDeleteConfirm} itemType="producto" />}
            {isPublishModalOpen && <CreatePublicationModal product={productToPublish} onClose={() => setIsPublishModalOpen(false)} />}
        </div>
    );
};

// Orquestador: Decide si mostrar Login, Carga o la App
const AppOrchestrator = () => {
    const { session, loading } = useContext(AppContext);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <p className="text-xl font-semibold text-white">Cargando...</p>
            </div>
        );
    }

    return session ? <AppContent /> : <LoginScreen />;
};

// Punto de entrada de la App (envuelto en el Provider)
// NOTA: ErrorBoundary y SessionContextProvider ya están en index.js, así que aquí solo necesitamos el AppProvider.
const App = () => (
    <AppProvider>
        <AppOrchestrator />
    </AppProvider>
);

export default App;