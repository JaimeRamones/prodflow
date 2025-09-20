// Ruta: src/App.js - ACTUALIZACIÓN PARA INCLUIR GARAJE

import React, { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Importaciones de Componentes (verificadas y completas)
import Dashboard from './components/Dashboard';
import InventoryList from './components/InventoryList';
import ProductEntry from './components/ProductEntry';
import SalesView from './components/SalesView';
import OrdersManagement from './components/OrdersManagement';
import WarehouseView from './components/WarehouseView';
import Garaje from './components/Garaje'; // ← NUEVO: Reemplaza Kits
import MovementHistory from './components/MovementHistory';
import Tools from './components/Tools';
import Integrations from './components/Integrations';
import PublicationsView from './components/PublicationsView';
import InFlow from './components/InFlow';
import LoginScreen from './components/LoginScreen';
import Notification from './components/Notification';
import EditProductModal from './components/EditProductModal';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';
import CreatePublicationModal from './components/CreatePublicationModal';

// Icono genérico para la barra lateral
const Icon = ({ path }) => (
    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={path}></path>
    </svg>
);

// Icono de hamburguesa para móvil
const HamburgerIcon = () => (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
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
    const [combos, setCombos] = useState([]); // ← NUEVO: Estado para combos
    const [salesOrders, setSalesOrders] = useState([]);
    const [supplierOrders, setSupplierOrders] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [notification, setNotification] = useState({ show: false, message: '', type: '' });
    const [isMeliConnected, setIsMeliConnected] = useState(false);
    const [meliChecked, setMeliChecked] = useState(false);

    const showMessage = (message, type = 'info') => {
        setNotification({ show: true, message, type });
    };

    // ARREGLADO: checkMeliConnection más robusta y con menos interferencias
    const checkMeliConnection = useCallback(async () => {
        // No verificar si ya está en proceso o no hay sesión
        if (!session?.user?.id || meliChecked) return;
        
        try {
            console.log('Verificando conexión MercadoLibre...');
            const { data, error } = await supabase
                .from('meli_credentials')
                .select('access_token, expires_at')
                .eq('user_id', session.user.id)
                .single();
            
            const isConnected = !error && data?.access_token;
            
            // Verificar si el token no ha expirado
            if (isConnected && data.expires_at) {
                const isExpired = new Date(data.expires_at) <= new Date();
                setIsMeliConnected(isConnected && !isExpired);
            } else {
                setIsMeliConnected(isConnected);
            }
            
            setMeliChecked(true);
            console.log('Conexión ML verificada:', isConnected);
        } catch (err) {
            console.warn('Error verificando ML connection:', err);
            setIsMeliConnected(false);
            setMeliChecked(true);
        }
    }, [session?.user?.id, meliChecked]);

    // ARREGLADO: Manejo de autenticación más limpio
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                setSession(session);
                setLoading(false);
            } catch (error) {
                console.error('Error initializing auth:', error);
                setLoading(false);
            }
        };

        initializeAuth();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            // Reset ML check when session changes
            setMeliChecked(false);
            if (!session) {
                setIsMeliConnected(false);
            }
        });

        return () => {
            if (authListener && authListener.subscription) {
                authListener.subscription.unsubscribe();
            }
        };
    }, []);
    
    // FUNCIONES PARA REFRESCAR DATOS (OPTIMIZADAS CON useCallback)
    const fetchProducts = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
        if (error) { showMessage('Error al refrescar los productos.', 'error'); } 
        else { setProducts(data || []); }
    }, [session?.user?.id]);

    const fetchSuppliers = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data, error } = await supabase.from('suppliers').select('*').order('name', { ascending: true });
        if (error) { showMessage('Error al refrescar los proveedores.', 'error'); }
        else { setSuppliers(data || []); }
    }, [session?.user?.id]);

    const fetchCategories = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data, error } = await supabase.from('categories').select('*').order('name', { ascending: true });
        if (error) { showMessage('Error al refrescar las categorías.', 'error'); }
        else { setCategories(data || []); }
    }, [session?.user?.id]);

    const fetchSalesOrders = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data, error } = await supabase.from('sales_orders').select(`*, order_items ( * )`).eq('user_id', session.user.id).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos de venta.', 'error'); } 
        else { setSalesOrders(data || []); }
    }, [session?.user?.id]);

    const fetchSupplierOrders = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data, error } = await supabase.from('supplier_orders').select(`*`).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos a proveedor.', 'error'); } 
        else { setSupplierOrders(data || []); }
    }, [session?.user?.id]);

    const fetchPurchaseOrders = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data, error } = await supabase.from('purchase_orders').select(`*`).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar órdenes de compra.', 'error'); } 
        else { setPurchaseOrders(data || []); }
    }, [session?.user?.id]);

    // ← NUEVO: Función para refrescar combos
    const fetchCombos = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data, error } = await supabase
            .from('garaje_combos_complete')
            .select('*')
            .eq('user_id', session.user.id)
            .order('updated_at', { ascending: false });
        if (error) showMessage('Error al cargar los combos.', 'error'); 
        else setCombos(data || []);
    }, [session?.user?.id, showMessage]);

    // ARREGLADO: Carga inicial de datos más robusta
    useEffect(() => {
        if (session?.user?.id) {
            // Verificar conexión ML solo después de cargar datos iniciales
            const loadData = async () => {
                await Promise.all([
                    fetchProducts(),
                    fetchSuppliers(),
                    fetchCategories(),
                    fetchSalesOrders(),
                    fetchSupplierOrders(),
                    fetchPurchaseOrders(),
                    fetchCombos(), // ← NUEVO: Cargar combos
                ]);
                
                // Verificar ML después de cargar datos
                setTimeout(() => checkMeliConnection(), 1000);
            };
            
            loadData();
        }
}, [session?.user?.id]);    
    const value = { 
        session, loading, showMessage, isMeliConnected, setIsMeliConnected,
        products, suppliers, categories, combos, salesOrders, supplierOrders, purchaseOrders, // ← NUEVO: combos en context
        notification, setNotification, 
        fetchProducts, fetchSuppliers, fetchCategories, fetchCombos, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders, // ← NUEVO: fetchCombos
        checkMeliConnection
    };
    
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// Componente de navegación móvil
const MobileNav = ({ isOpen, onClose, currentPath, onLogout }) => {
    if (!isOpen) return null;

    const navItems = [
        { path: '/dashboard', icon: "M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z", label: "Dashboard" },
        { path: '/inventory', icon: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4", label: "Inventario" },
        { path: '/entry', icon: "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1", label: "Entrada" },
        { path: '/inflow', icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "InFlow" },
        { path: '/sales', icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z", label: "Ventas" },
        { path: '/orders', icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01", label: "Pedidos" },
        { path: '/garaje', icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z", label: "Garaje" }, // ← NUEVO: Icono de garaje
        { path: '/integrations', icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "Integraciones" },
    ];

    return (
        <div className="fixed inset-0 z-50 md:hidden">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
            <div className="fixed top-0 left-0 w-64 h-full bg-gray-800 border-r border-gray-700 overflow-y-auto">
                <div className="p-4">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center">
                            <img 
                                src="/logo.png" 
                                alt="ProdFlow Logo" 
                                className="w-8 h-8 mr-2"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                }}
                            />
                            <span className="text-xl font-semibold text-white">ProdFlow</span>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <nav className="space-y-2">
                        {navItems.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={onClose}
                                className={`flex items-center w-full p-3 text-base font-normal rounded-lg transition duration-75 ${
                                    currentPath === item.path ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                            >
                                <Icon path={item.icon} />
                                <span className="ml-3">{item.label}</span>
                            </Link>
                        ))}
                        <button
                            onClick={() => { onLogout(); onClose(); }}
                            className="flex items-center w-full p-3 text-base font-normal text-gray-400 rounded-lg transition duration-75 hover:bg-red-800 hover:text-white"
                        >
                            <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            <span className="ml-3">Cerrar Sesión</span>
                        </button>
                    </nav>
                </div>
            </div>
        </div>
    );
};

// ARREGLADO: Componente de contenido principal mejorado
const AppContent = () => {
    const location = useLocation();
    const [productToEdit, setProductToEdit] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState(null);
    const [productToPublish, setProductToPublish] = useState(null);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

    const { showMessage, notification, setNotification, fetchProducts, isMeliConnected } = useContext(AppContext);

    const handleEdit = (product) => { setProductToEdit(product); setIsEditModalOpen(true); };
    const handlePublish = (product) => { setProductToPublish(product); setIsPublishModalOpen(true); };

    const handleSave = async (editedProduct) => {
        try {
            const { id, ...dataToUpdate } = editedProduct;
            delete dataToUpdate.created_at; 
            const { error } = await supabase.from('products').update(dataToUpdate).eq('id', id);
            if (error) throw error;
            showMessage("Producto actualizado con éxito.", "success");
            setIsEditModalOpen(false);
            await fetchProducts();
        } catch (error) { showMessage(`Error al guardar cambios: ${error.message}`, 'error'); }
    };

    const handleDeleteConfirm = async () => {
        if (!productToDelete) return;
        try {
            const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
            if (error) throw error;
            showMessage(`Producto ${productToDelete.sku} eliminado con éxito.`, 'success');
            await fetchProducts();
        } catch (error) { showMessage(`Error al eliminar el producto: ${error.message}`, 'error'); }
        finally { setProductToDelete(null); }
    };
    
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { showMessage("Error al cerrar sesión: " + error.message, 'error'); }
    };

    // ARREGLADO: Componente NavButton mejorado sin interferir con ML
    const NavButton = ({ to, iconPath, children, requiresMeli = false }) => {
        const isActive = location.pathname === to;
        const isDisabled = requiresMeli && !isMeliConnected;
        
        if (isDisabled) {
            return (
                <li>
                    <Link
                        to="/integrations"
                        className="flex items-center w-full p-2 text-base font-normal rounded-lg text-gray-500 hover:bg-gray-700 hover:text-white transition duration-75"
                        title="Requiere conexión con MercadoLibre"
                    >
                        <Icon path={iconPath} />
                        <span className="flex-1 ml-3 whitespace-nowrap text-sm md:text-base">{children}</span>
                        <span className="text-xs bg-yellow-600 px-2 py-1 rounded-full">MELI</span>
                    </Link>
                </li>
            );
        }

        return (
            <li>
                <Link
                    to={to}
                    className={`flex items-center w-full p-2 text-base font-normal rounded-lg transition duration-75 group ${
                        isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                    }`}
                >
                    <Icon path={iconPath} />
                    <span className="flex-1 ml-3 whitespace-nowrap text-sm md:text-base">{children}</span>
                </Link>
            </li>
        );
    };
    
    return (
        <div className="bg-gray-900 text-gray-300 min-h-screen">
            {notification.show && (
                <Notification
                    message={notification.message}
                    type={notification.type}
                    onClose={() => setNotification({ show: false, message: '', type: '' })}
                />
            )}

            {/* Header móvil */}
            <div className="md:hidden bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
                <button
                    onClick={() => setIsMobileNavOpen(true)}
                    className="text-gray-400 hover:text-white"
                >
                    <HamburgerIcon />
                </button>
                <div className="flex items-center">
                    <img 
                        src="/logo.png" 
                        alt="ProdFlow Logo" 
                        className="w-6 h-6 mr-2"
                        onError={(e) => {
                            e.target.style.display = 'none';
                        }}
                    />
                    <span className="text-lg font-semibold text-white">ProdFlow</span>
                </div>
                <div className="w-6"></div>
            </div>

            {/* Navegación móvil */}
            <MobileNav 
                isOpen={isMobileNavOpen} 
                onClose={() => setIsMobileNavOpen(false)}
                currentPath={location.pathname}
                onLogout={handleLogout}
            />

            {/* Sidebar desktop */}
            <aside className="hidden md:fixed md:top-0 md:left-0 md:z-40 md:w-64 md:h-screen md:transition-transform md:bg-gray-800 md:border-r md:border-gray-700 md:block">
                <div className="h-full px-3 py-4 overflow-y-auto bg-gray-800">
                    <div className="flex items-center pl-2.5 mb-5">
                        <img 
                            src="/logo.png" 
                            alt="ProdFlow Logo" 
                            className="w-8 h-8 mr-3"
                            onError={(e) => {
                                e.target.style.display = 'none';
                            }}
                        />
                        <span className="self-center text-xl font-semibold whitespace-nowrap text-white">ProdFlow</span>
                    </div>
                    <ul className="space-y-2">
                        <NavButton to="/dashboard" iconPath="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z">Dashboard</NavButton>
                        <NavButton to="/inventory" iconPath="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4">Inventario</NavButton>
                        <NavButton to="/entry" iconPath="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1">Entrada</NavButton>
                        <NavButton to="/inflow" iconPath="M13 10V3L4 14h7v7l9-11h-7z" requiresMeli={true}>InFlow</NavButton>
                        <NavButton to="/sales" iconPath="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z">Ventas</NavButton>
                        <NavButton to="/orders" iconPath="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01">Pedidos</NavButton>
                        <NavButton to="/warehouse" iconPath="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h6m-6 4h6m-6 4h6">Depósito</NavButton>
                        
                        {/* ← NUEVO: Garaje reemplaza a Kits */}
                        <NavButton to="/garaje" iconPath="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z">Garaje</NavButton>
                        
                        <NavButton to="/history" iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z">Historial</NavButton>
                    </ul>
                    <ul className="pt-4 mt-4 space-y-2 border-t border-gray-700">
                        <NavButton to="/tools" iconPath="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z">Herramientas</NavButton>
                        <NavButton to="/integrations" iconPath="M13 10V3L4 14h7v7l9-11h-7z">Integraciones</NavButton>
                        <NavButton to="/publications" iconPath="M3 10h18M3 14h18M3 6h18">Publicaciones</NavButton>
                        <li>
                            <button onClick={handleLogout} className="flex items-center w-full p-2 text-base font-normal text-gray-400 rounded-lg transition duration-75 group hover:bg-red-800 hover:text-white">
                                <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                <span className="flex-1 ml-3 whitespace-nowrap text-sm md:text-base">Cerrar Sesión</span>
                            </button>
                        </li>
                    </ul>
                </div>
            </aside>

            <main className="p-4 md:ml-64">
                <div className="pt-4 md:pt-0">
                    <Routes>
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/inventory" element={<InventoryList onEdit={handleEdit} onDelete={setProductToDelete} onPublish={handlePublish} />} />
                        <Route path="/entry" element={<ProductEntry />} />
                        <Route path="/sales" element={<SalesView />} />
                        <Route path="/orders" element={<OrdersManagement />} />
                        <Route path="/warehouse" element={<WarehouseView />} />
                        
                        {/* ← NUEVO: Ruta para Garaje */}
                        <Route path="/garaje" element={<Garaje />} />
                        
                        <Route path="/history" element={<MovementHistory />} />
                        <Route path="/tools" element={<Tools />} />
                        <Route path="/integrations" element={<Integrations />} />
                        <Route path="/publications" element={<PublicationsView />} />
                        
                        {/* ARREGLADO: InFlow sin redirección forzada */}
                        <Route 
                            path="/inflow" 
                            element={<InFlow />} 
                        />
                        
                        {/* Redirección por defecto */}
                        <Route 
                            path="/" 
                            element={<Navigate to="/dashboard" replace />} 
                        />
                    </Routes>
                </div>
            </main>

            {isEditModalOpen && <EditProductModal product={productToEdit} onClose={() => setIsEditModalOpen(false)} onSave={handleSave} />}
            {productToDelete && <ConfirmDeleteModal item={productToDelete} onCancel={() => setProductToDelete(null)} onConfirm={handleDeleteConfirm} itemType="producto" />}
            {isPublishModalOpen && <CreatePublicationModal product={productToPublish} onClose={() => setIsPublishModalOpen(false)} />}
        </div>
    );
};

const AppOrchestrator = () => {
    const { session, loading } = useContext(AppContext);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-xl font-semibold text-white">Cargando...</p>
                </div>
            </div>
        );
    }

    return session ? <AppContent /> : <LoginScreen />;
};

const App = () => (
    <AppProvider>
        <Router>
            <AppOrchestrator />
        </Router>
    </AppProvider>
);

export default App;