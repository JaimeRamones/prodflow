// Ruta: src/App.js

import React, { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Importamos el nuevo componente de la página de inicio
import LandingPage from './components/LandingPage';

// Importaciones de los componentes de tu aplicación
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

// Iconos para la barra lateral
import { HomeIcon, ArchiveBoxIcon, ArrowDownOnSquareIcon, ShoppingCartIcon, DocumentTextIcon, BuildingStorefrontIcon, Squares2X2Icon, ClockIcon, WrenchScrewdriverIcon, BoltIcon, DocumentDuplicateIcon, ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';

export const AppContext = createContext();

const AppProvider = ({ children }) => {
    // ... (Todo el contenido de tu AppProvider se mantiene exactamente igual)
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

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });
        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
        return () => authListener.subscription.unsubscribe();
    }, []);
    
    const fetchProducts = useCallback(async () => { /* ... */ }, []);
    const fetchSuppliers = useCallback(async () => { /* ... */ }, []);
    const fetchCategories = useCallback(async () => { /* ... */ }, []);
    const fetchSalesOrders = useCallback(async () => { /* ... */ }, [session]);
    const fetchSupplierOrders = useCallback(async () => { /* ... */ }, []);
    const fetchPurchaseOrders = useCallback(async () => { /* ... */ }, []);
    const fetchKits = useCallback(async () => { /* ... */ }, []);

    useEffect(() => {
        if (session) {
            Promise.all([ fetchProducts(), fetchSuppliers(), fetchCategories(), fetchSalesOrders(), fetchSupplierOrders(), fetchPurchaseOrders(), fetchKits() ]);
        }
    }, [session, fetchProducts, fetchSuppliers, fetchCategories, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders, fetchKits]);
    
    const value = { session, loading, showMessage, products, suppliers, categories, kits, salesOrders, supplierOrders, purchaseOrders, notification, setNotification, fetchProducts, fetchSuppliers, fetchCategories, fetchKits, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders };
    
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};


// --- AQUÍ ESTÁ EL CAMBIO PRINCIPAL ---
// El componente App ahora es el enrutador principal
const App = () => (
    <AppProvider>
        <Router>
            <Routes>
                {/* La ruta raíz "/" ahora muestra la página de inicio */}
                <Route path="/" element={<LandingPage />} />
                
                {/* La aplicación principal ahora vive bajo la ruta "/app" */}
                <Route path="/app/*" element={<AppOrchestrator />} />
            </Routes>
        </Router>
    </AppProvider>
);

// Orquestador: Decide si mostrar Login o la App (se mantiene igual)
const AppOrchestrator = () => {
    const { session, loading } = useContext(AppContext);
    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Cargando...</div>;
    }
    return session ? <AppContent /> : <LoginScreen />;
};

// Contenido de la App: Ahora usa las rutas de React Router
const AppContent = () => {
    const { notification, setNotification, fetchProducts } = useContext(AppContext);
    // ... (El resto de los estados y manejadores se mantienen igual)
    const [productToEdit, setProductToEdit] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState(null);
    const [productToPublish, setProductToPublish] = useState(null);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const handleEdit = (product) => { setProductToEdit(product); setIsEditModalOpen(true); };
    const handlePublish = (product) => { setProductToPublish(product); setIsPublishModalOpen(true); };
    const handleSave = async (editedProduct) => { /* ... */ };
    const handleDeleteConfirm = async () => { /* ... */ };
    const handleLogout = async () => { await supabase.auth.signOut(); };

    const navLinks = [
        { to: "/app/dashboard", text: "Dashboard", icon: HomeIcon },
        { to: "/app/inventario", text: "Inventario", icon: ArchiveBoxIcon },
        { to: "/app/entrada", text: "Entrada", icon: ArrowDownOnSquareIcon },
        { to: "/app/ventas", text: "Ventas", icon: ShoppingCartIcon },
        { to: "/app/pedidos", text: "Pedidos", icon: DocumentTextIcon },
        { to: "/app/deposito", text: "Depósito", icon: BuildingStorefrontIcon },
        { to: "/app/kits", text: "Kits", icon: Squares2X2Icon },
        { to: "/app/historial", text: "Historial", icon: ClockIcon },
    ];
    const secondaryLinks = [
        { to: "/app/herramientas", text: "Herramientas", icon: WrenchScrewdriverIcon },
        { to: "/app/integraciones", text: "Integraciones", icon: BoltIcon },
        { to: "/app/publicaciones", text: "Publicaciones", icon: DocumentDuplicateIcon },
    ];

    return (
        <div className="bg-gray-900 text-gray-300 min-h-screen">
            {notification.show && <Notification message={notification.message} type={notification.type} onClose={() => setNotification({ show: false, message: '', type: '' })} />}
            
            <aside className="fixed top-0 left-0 z-40 w-64 h-screen bg-gray-800 border-r border-gray-700">
                <div className="h-full px-3 py-4 overflow-y-auto">
                    <div className="flex items-center pl-2.5 mb-5">
                        <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAQABAADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigA" alt="ProdFlow Logo" className="h-10 w-auto" />
                        <span className="self-center text-xl font-semibold text-white ml-3">ProdFlow</span>
                    </div>
                    <ul className="space-y-2">
                        {navLinks.map(link => (
                            <li key={link.to}>
                                <NavLink to={link.to} className={({ isActive }) => `flex items-center w-full p-2 rounded-lg group ${isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                                    <link.icon className="w-6 h-6" />
                                    <span className="ml-3">{link.text}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                    <ul className="pt-4 mt-4 space-y-2 border-t border-gray-700">
                        {secondaryLinks.map(link => (
                            <li key={link.to}>
                                <NavLink to={link.to} className={({ isActive }) => `flex items-center w-full p-2 rounded-lg group ${isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>
                                    <link.icon className="w-6 h-6" />
                                    <span className="ml-3">{link.text}</span>
                                </NavLink>
                            </li>
                        ))}
                         <li>
                            <button onClick={handleLogout} className="flex items-center w-full p-2 text-gray-400 rounded-lg group hover:bg-red-800 hover:text-white">
                                <ArrowLeftOnRectangleIcon className="w-6 h-6" />
                                <span className="ml-3">Cerrar Sesión</span>
                            </button>
                        </li>
                    </ul>
                </div>
            </aside>

            <main className="p-4 sm:ml-64">
                <div className="mt-14">
                    <Routes>
                        <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/inventario" element={<InventoryList onEdit={handleEdit} onDelete={setProductToDelete} onPublish={handlePublish} />} />
                        <Route path="/entrada" element={<ProductEntry />} />
                        <Route path="/ventas" element={<SalesView />} />
                        <Route path="/pedidos" element={<OrdersManagement />} />
                        <Route path="/deposito" element={<WarehouseView />} />
                        <Route path="/kits" element={<Kits />} />
                        <Route path="/historial" element={<MovementHistory />} />
                        <Route path="/herramientas" element={<Tools />} />
                        <Route path="/integraciones" element={<Integrations />} />
                        <Route path="/publicaciones" element={<PublicationsView />} />
                    </Routes>
                </div>
            </main>
            
            {isEditModalOpen && <EditProductModal product={productToEdit} onClose={() => setIsEditModalOpen(false)} onSave={handleSave} />}
            {productToDelete && <ConfirmDeleteModal item={productToDelete} onCancel={() => setProductToDelete(null)} onConfirm={handleDeleteConfirm} itemType="producto" />}
            {isPublishModalOpen && <CreatePublicationModal product={productToPublish} onClose={() => setIsPublishModalOpen(false)} />}
        </div>
    );
}

export default App;