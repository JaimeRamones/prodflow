// Ruta: src/App.js

import React, { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { supabase } from './supabaseClient';

// Importaciones de Componentes (verificadas y completas)
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

    // Manejo de Sesión
    useEffect(() => {
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
    
    // --- FUNCIONES PARA REFRESCAR DATOS ---
    const fetchProducts = useCallback(async () => {
        const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
        if (error) { showMessage('Error al refrescar los productos.', 'error'); } 
        else { setProducts(data || []); }
    }, []);

    const fetchSuppliers = useCallback(async () => {
        const { data, error } = await supabase.from('suppliers').select('*').order('name', { ascending: true });
        if (error) { showMessage('Error al refrescar los proveedores.', 'error'); }
        else { setSuppliers(data || []); }
    }, []);

    const fetchCategories = useCallback(async () => {
        const { data, error } = await supabase.from('categories').select('*').order('name', { ascending: true });
        if (error) { showMessage('Error al refrescar las categorías.', 'error'); }
        else { setCategories(data || []); }
    }, []);

    // Función clave para Realtime: Carga las ventas del usuario actual (Robusta)
    const fetchSalesOrders = useCallback(async () => {
        // Obtenemos la sesión actual de forma segura
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;

        if (!userId || sessionError) {
            // Si no hay usuario (ej. cerró sesión), limpiamos las ventas
            setSalesOrders([]);
            return;
        }

        const { data, error } = await supabase.from('sales_orders').select(`*, order_items ( * )`).eq('user_id', userId).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos de venta.', 'error'); } 
        else { setSalesOrders(data || []); }
    }, []);

    const fetchSupplierOrders = useCallback(async () => {
        // Hacemos esta función robusta también
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) return;

        // Aseguramos filtrar por user_id
        const { data, error } = await supabase.from('supplier_orders').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos a proveedor.', 'error'); }
        else { setSupplierOrders(data || []); }
    }, []);

    const fetchPurchaseOrders = useCallback(async () => {
        const { data, error } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar órdenes de compra.', 'error'); }
        else { setPurchaseOrders(data || []); }
    }, []);

    const fetchKits = useCallback(async () => {
        const { data, error } = await supabase.from('kits').select('*').order('name', { ascending: true });
        if (error) { showMessage('Error al refrescar los kits.', 'error'); }
        else { setKits(data || []); }
    }, []);

    // Carga inicial de datos cuando el usuario inicia sesión
    useEffect(() => {
        if (session) {
            Promise.all([
                fetchProducts(),
                fetchSuppliers(),
                fetchCategories(),
                fetchSalesOrders(),
                fetchSupplierOrders(),
                fetchPurchaseOrders(),
                fetchKits()
            ]);
        }
    }, [session, fetchProducts, fetchSuppliers, fetchCategories, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders, fetchKits]);
    
    // --- IMPLEMENTACIÓN DE TIEMPO REAL (Realtime Subscriptions) ---
    useEffect(() => {
        const userId = session?.user?.id;
        // Solo iniciamos la suscripción si hay un usuario autenticado
        if (!userId) return;

        console.log("Iniciando suscripciones en tiempo real...");

        // 1. Suscripción a sales_orders (Nuevas ventas y cambios de estado)
        const salesChannel = supabase
            .channel('public:sales_orders')
            .on(
                'postgres_changes',
                // Filtramos por seguridad y eficiencia para recibir solo los del usuario actual
                { event: '*', schema: 'public', table: 'sales_orders', filter: `user_id=eq.${userId}` },
                (payload) => {
                    console.log('Cambio en tiempo real recibido (Ventas):', payload.eventType);
                    // Al detectar cualquier cambio, volvemos a cargar los datos.
                    fetchSalesOrders(); 
                }
            )
            .subscribe();

        // 2. Suscripción a products (Cambios de stock)
        const productsChannel = supabase
            .channel('public:products')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'products' },
                (payload) => {
                    console.log('Cambio en tiempo real recibido (Productos)');
                    // Actualizamos eficientemente el producto modificado en el estado local sin recargar todo
                    setProducts(currentProducts => 
                        currentProducts.map(p => 
                            p.id === payload.new.id ? payload.new : p
                        )
                    );
                }
            )
            .subscribe();

        // 3. Suscripción a supplier_orders (Nuevos pedidos a proveedor)
         const supplierOrdersChannel = supabase
            .channel('public:supplier_orders')
            .on(
                'postgres_changes',
                // Filtramos por user_id
                { event: '*', schema: 'public', table: 'supplier_orders', filter: `user_id=eq.${userId}` }, 
                (payload) => {
                    console.log('Cambio en tiempo real recibido (Proveedor)');
                    fetchSupplierOrders();
                }
            )
            .subscribe();

        // Función de limpieza: Se ejecuta al cerrar sesión o desmontar el componente
        return () => {
            console.log("Cerrando suscripciones en tiempo real.");
            supabase.removeChannel(salesChannel);
            supabase.removeChannel(productsChannel);
            supabase.removeChannel(supplierOrdersChannel);
        };
    }, [session, fetchSalesOrders, fetchSupplierOrders]); // Dependencias
    // --------------------------------------------------------------


    // Proveedor del Contexto
    const contextValue = {
        session, products, suppliers, categories, kits, salesOrders, supplierOrders, purchaseOrders,
        fetchProducts, fetchSuppliers, fetchCategories, fetchKits, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders,
        showMessage
    };

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Cargando...</div>;
    }

    return (
        <AppContext.Provider value={contextValue}>
            {children}
            <Notification
                show={notification.show}
                message={notification.message}
                type={notification.type}
                onClose={() => setNotification({ ...notification, show: false })}
            />
        </AppContext.Provider>
    );
};

// Componente Principal App (Maneja la navegación y el layout)
const App = () => {
    const [activeView, setActiveView] = useState('dashboard');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [deletingProduct, setDeletingProduct] = useState(null);
    const [isCreatePublicationOpen, setIsCreatePublicationOpen] = useState(false);

    const handleEdit = (product) => setEditingProduct(product);
    const handleDelete = (product) => setDeletingProduct(product);
    const handleCreatePublication = () => setIsCreatePublicationOpen(true);

    const navItems = [
        { name: 'dashboard', label: 'Dashboard', iconPath: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { name: 'inventory', label: 'Inventario', iconPath: 'M5 8h14M5 12h14M5 16h14' },
        { name: 'entry', label: 'Ingreso/Egreso', iconPath: 'M17 16l4-4m0 0l-4-4m4 4H3' },
        { name: 'sales', label: 'Ventas', iconPath: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
        { name: 'orders', label: 'Hoja de Pedidos', iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
        { name: 'warehouse', label: 'Depósito', iconPath: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M12 7v10' },
        { name: 'kits', label: 'Kits', iconPath: 'M16 17l-4 4m0 0l-4-4m4 4V3' },
        { name: 'movements', label: 'Historial', iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        { name: 'publications', label: 'Publicaciones', iconPath: 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.414 12H3m11-3H8m4 6h-4' },
        { name: 'tools', label: 'Herramientas', iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z' },
        { name: 'integrations', label: 'Integraciones', iconPath: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
    ];

    const renderView = () => {
        switch (activeView) {
            case 'dashboard': return <Dashboard />;
            case 'inventory': return <InventoryList onEdit={handleEdit} onDelete={handleDelete} onCreatePublication={handleCreatePublication} />;
            case 'entry': return <ProductEntry />;
            case 'sales': return <SalesView />;
            case 'orders': return <OrdersManagement />;
            case 'warehouse': return <WarehouseView />;
            case 'kits': return <Kits />;
            case 'movements': return <MovementHistory />;
            case 'publications': return <PublicationsView />;
            case 'tools': return <Tools />;
            case 'integrations': return <Integrations />;
            default: return <Dashboard />;
        }
    };

    return (
        <AppProvider>
            <AppContext.Consumer>
                {({ session, fetchProducts }) => (
                    !session ? <LoginScreen /> : (
                        <div className="flex h-screen bg-gray-900 text-white">
                            {/* Sidebar */}
                            <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-30 w-64 bg-gray-800 shadow-lg transform transition duration-200 ease-in-out md:relative md:translate-x-0`}>
                                <div className="p-4 text-2xl font-bold border-b border-gray-700">ProdFlow</div>
                                <nav className="mt-4">
                                    {navItems.map(item => (
                                        <a key={item.name} href={`#${item.name}`}
                                           className={`flex items-center p-3 m-2 rounded-lg transition duration-150 ${activeView === item.name ? 'bg-blue-700 shadow-md' : 'text-gray-300 hover:bg-gray-700'}`}
                                           onClick={() => { setActiveView(item.name); setIsSidebarOpen(false); }}>
                                            <Icon path={item.iconPath} />
                                            <span className="ml-3">{item.label}</span>
                                        </a>
                                    ))}
                                </nav>
                                <div className="absolute bottom-0 w-full p-4 border-t border-gray-700">
                                    <button onClick={async () => await supabase.auth.signOut()} className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg font-semibold">Cerrar Sesión</button>
                                </div>
                            </div>

                            {/* Main content */}
                            <div className="flex-1 flex flex-col overflow-hidden">
                                {/* Header */}
                                <header className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700 shadow-md md:hidden">
                                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-400 focus:outline-none focus:text-white">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                                    </button>
                                    <div className="text-xl font-bold">ProdFlow</div>
                                </header>

                                {/* View Container */}
                                <main className="flex-1 overflow-x-hidden overflow-y-auto p-6">
                                    {renderView()}
                                </main>
                            </div>
                            
                            {/* Modals */}
                            {editingProduct && <EditProductModal product={editingProduct} onClose={() => { setEditingProduct(null); fetchProducts(); }} />}
                            {deletingProduct && <ConfirmDeleteModal product={deletingProduct} onClose={() => { setDeletingProduct(null); fetchProducts(); }} />}
                            {isCreatePublicationOpen && <CreatePublicationModal onClose={() => setIsCreatePublicationOpen(false)} />}
                        </div>
                    )
                )}
            </AppContext.Consumer>
        </AppProvider>
    );
};

export default App;