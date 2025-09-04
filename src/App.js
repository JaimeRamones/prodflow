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
// --- NUEVA IMPORTACIÓN ---
// 1. Importamos el nuevo componente que acabas de crear.
import PublicationGenerator from './components/PublicationGenerator';


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
    const [notification, setNotification] = useState({ message: '', type: '', visible: false });
    const [allProducts, setAllProducts] = useState([]);
    const [allSuppliers, setAllSuppliers] = useState([]);
    const [allWarehouses, setAllWarehouses] = useState([]);


    const fetchInitialData = useCallback(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);

        if (session) {
            const { data: productsData, error: productsError } = await supabase.from('products').select('*');
            if (productsError) console.error('Error fetching products:', productsError);
            else setAllProducts(productsData);

            const { data: suppliersData, error: suppliersError } = await supabase.from('suppliers').select('*');
            if (suppliersError) console.error('Error fetching suppliers:', suppliersError);
            else setAllSuppliers(suppliersData);

            const { data: warehousesData, error: warehousesError } = await supabase.from('warehouses').select('*');
            if (warehousesError) console.error('Error fetching warehouses:', warehousesError);
            else setAllWarehouses(warehousesData);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchInitialData();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                fetchInitialData();
            }
        });
        return () => subscription.unsubscribe();
    }, [fetchInitialData]);


    const showNotification = (message, type = 'success') => {
        setNotification({ message, type, visible: true });
        setTimeout(() => {
            setNotification({ message: '', type: '', visible: false });
        }, 3000);
    };

    const refreshData = () => {
        fetchInitialData();
    };


    const value = {
        session,
        loading,
        notification,
        showNotification,
        allProducts,
        allSuppliers,
        allWarehouses,
        refreshData
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

const App = () => {
    const { session, showNotification, refreshData } = useContext(AppContext);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [productToEdit, setProductToEdit] = useState(null);
    const [productToDelete, setProductToDelete] = useState(null);
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
    const [productToPublish, setProductToPublish] = useState(null);


    const handleEdit = (product) => {
        setProductToEdit(product);
        setIsEditModalOpen(true);
    };

    const handleSave = async (updatedProduct) => {
        const { error } = await supabase.from('products').update(updatedProduct).eq('id', updatedProduct.id);
        if (error) {
            showNotification(`Error al actualizar: ${error.message}`, 'error');
        } else {
            showNotification('Producto actualizado con éxito');
            refreshData();
        }
        setIsEditModalOpen(false);
    };
    
    const handleDelete = (product) => {
        setProductToDelete(product);
    };

    const handleDeleteConfirm = async () => {
        if (!productToDelete) return;
        const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
        if (error) {
            showNotification(`Error al eliminar: ${error.message}`, 'error');
        } else {
            showNotification('Producto eliminado con éxito');
            refreshData();
        }
        setProductToDelete(null);
    };

    const handlePublish = (product) => {
        setProductToPublish(product);
        setIsPublishModalOpen(true);
    };


    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            showNotification(`Error al cerrar sesión: ${error.message}`, 'error');
        } else {
            showNotification('Sesión cerrada con éxito');
            // La recarga de estado se manejará con onAuthStateChange
        }
    };
    
    if (!session) {
        return <LoginScreen />;
    }

    const renderActiveTab = () => {
        // --- NUEVO CASE ---
        // 4. Agregamos el `case` para que sepa qué componente mostrar
        //    cuando hagamos clic en el nuevo botón del menú.
        switch (activeTab) {
            case 'dashboard': return <Dashboard />;
            case 'inventory': return <InventoryList onEdit={handleEdit} onDelete={handleDelete} onPublish={handlePublish} />;
            case 'entry': return <ProductEntry />;
            case 'sales': return <SalesView />;
            case 'orders': return <OrdersManagement />;
            case 'warehouse': return <WarehouseView />;
            case 'kits': return <Kits />;
            case 'history': return <MovementHistory />;
            case 'tools': return <Tools />;
            case 'integrations': return <Integrations />;
            case 'publications': return <PublicationsView />;
            case 'development': return <PublicationGenerator />;
            default: return <Dashboard />;
        }
    };
    
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
        { id: 'inventory', label: 'Inventario', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { id: 'entry', label: 'Ingreso', icon: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1' },
        { id: 'sales', label: 'Ventas', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4z' },
        { id: 'orders', label: 'Pedidos', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
        { id: 'warehouse', label: 'Depósitos', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
        { id: 'kits', label: 'Kits', icon: 'M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z' },
        { id: 'history', label: 'Historial', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        { id: 'publications', label: 'Publicaciones', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z' },
        { id: 'integrations', label: 'Integraciones', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { id: 'tools', label: 'Herramientas', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
         // --- NUEVO BOTÓN ---
        // 2. Agregamos el nuevo botón a la lista del menú. Le ponemos un ícono de desarrollo.
        { id: 'development', label: 'Desarrollo', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
    ];


    return (
        <div className="bg-gray-800">
             <nav className="fixed top-0 z-50 w-full bg-gray-900 border-b border-gray-700">
                <div className="px-3 py-3 lg:px-5 lg:pl-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center justify-start">
                             <button data-drawer-target="logo-sidebar" data-drawer-toggle="logo-sidebar" aria-controls="logo-sidebar" type="button" className="inline-flex items-center p-2 text-sm text-gray-400 rounded-lg sm:hidden hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600">
                                <span className="sr-only">Open sidebar</span>
                                <svg className="w-6 h-6" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                   <path clipRule="evenodd" fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z"></path>
                                </svg>
                             </button>
                            <a href="#" className="flex ml-2 md:mr-24">
                                <span className="self-center text-xl font-semibold sm:text-2xl whitespace-nowrap text-white">ProdFlow</span>
                            </a>
                        </div>
                    </div>
                </div>
            </nav>

            <aside id="logo-sidebar" className="fixed top-0 left-0 z-40 w-64 h-screen pt-20 transition-transform -translate-x-full bg-gray-900 border-r border-gray-700 sm:translate-x-0" aria-label="Sidebar">
                <div className="h-full px-3 pb-4 overflow-y-auto bg-gray-900">
                    <ul className="space-y-2 font-medium">
                        {menuItems.map(item => (
                            <li key={item.id}>
                                <button onClick={() => setActiveTab(item.id)} className={`flex items-center p-2 rounded-lg w-full text-left ${activeTab === item.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                                    <Icon path={item.icon} />
                                    <span className="flex-1 ml-3 whitespace-nowrap">{item.label}</span>
                                </button>
                            </li>
                        ))}
                        {/* --- Separador y botón de logout sin cambios --- */}
                        <li>
                            <div className="border-t border-gray-700 my-4"></div>
                        </li>
                         <li>
                            <button onClick={handleLogout} className="flex items-center p-2 text-gray-400 rounded-lg hover:bg-gray-700 hover:text-white w-full">
                                <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                <span className="flex-1 ml-3 whitespace-nowrap">Cerrar Sesión</span>
                            </button>
                        </li>
                    </ul>
                </div>
            </aside>

            <main className="p-4 sm:ml-64">
                <div className="mt-14"> 
                    {renderActiveTab()}
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
                <p className="text-xl font-semibold text-white">Cargando...</p>
            </div>
        );
    }

    return (
        <>
            <App />
            <Notification />
        </>
    );
}


export default function Main() {
    return (
        <AppProvider>
            <AppOrchestrator />
        </AppProvider>
    );
}
