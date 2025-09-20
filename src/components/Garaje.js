import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import CreateComboModal from './CreateComboModal';
import EditComboModal from './EditComboModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import ComboImportExportModal from './ComboImportExportModal';

// --- COMPONENTE DE FILA DE COMBO (CON VISTA DESPLEGABLE) ---
const ComboRow = ({ combo, onEdit, onDelete, onPublishToMeli, isMeliConnected }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    const handleToggleExpand = () => {
        setIsExpanded(!isExpanded);
    };

    const handleToggleActive = async () => {
        setIsUpdating(true);
        try {
            const { error } = await supabase
                .from('garaje_combos')
                .update({ is_active: !combo.is_active })
                .eq('id', combo.id);
            
            if (error) throw error;
        } catch (error) {
            console.error('Error al cambiar estado del combo:', error);
        } finally {
            setIsUpdating(false);
        }
    };

    const getStockChip = (stock) => {
        if (stock === 0) return <span className="px-2 py-1 bg-red-600 text-white text-xs rounded-full">Sin Stock</span>;
        if (stock <= 5) return <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded-full">Bajo: {stock}</span>;
        return <span className="px-2 py-1 bg-green-600 text-white text-xs rounded-full">{stock}</span>;
    };

    const formatPrice = (price) => {
        return new Intl.NumberFormat('es-AR', { 
            style: 'currency', 
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        }).format(price || 0);
    };

    return (
        <>
            <tr className={`${combo.is_active ? 'bg-gray-800' : 'bg-gray-800/50'} border-b border-gray-700 hover:bg-gray-700/50`}>
                <td className="px-4 py-2 text-center">
                    <button 
                        onClick={handleToggleExpand} 
                        className="p-1.5 rounded-full hover:bg-gray-600"
                    >
                        <svg 
                            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>
                </td>
                
                <th scope="row" className="px-6 py-4 font-medium text-white whitespace-nowrap">
                    <div className="flex flex-col">
                        <span className="font-mono text-sm text-blue-400">{combo.combo_sku}</span>
                        <span className="text-white">{combo.combo_name}</span>
                    </div>
                </th>
                
                <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                        {combo.brands && combo.brands.length > 0 && (
                            combo.brands.slice(0, 2).map((brand, idx) => (
                                <span key={idx} className="px-2 py-1 bg-blue-600/20 text-blue-300 text-xs rounded">
                                    {brand}
                                </span>
                            ))
                        )}
                        {combo.brands && combo.brands.length > 2 && (
                            <span className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                                +{combo.brands.length - 2}
                            </span>
                        )}
                    </div>
                </td>
                
                <td className="px-6 py-4 text-center">
                    <span className="font-bold text-amber-300">{combo.total_items || 0}</span>
                </td>
                
                <td className="px-6 py-4 text-center">
                    {getStockChip(combo.available_stock || 0)}
                </td>
                
                <td className="px-6 py-4 text-center">
                    <div className="flex flex-col">
                        <span className="font-bold text-green-400">{formatPrice(combo.final_price)}</span>
                        {combo.margin_percentage && (
                            <span className="text-xs text-gray-400">
                                Margen: {combo.margin_percentage.toFixed(1)}%
                            </span>
                        )}
                    </div>
                </td>
                
                <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                        <button
                            onClick={handleToggleActive}
                            disabled={isUpdating}
                            className={`w-10 h-6 rounded-full flex items-center transition-colors ${
                                combo.is_active ? 'bg-green-600' : 'bg-gray-600'
                            } ${isUpdating ? 'opacity-50' : ''}`}
                        >
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                                combo.is_active ? 'translate-x-5' : 'translate-x-1'
                            }`}></div>
                        </button>
                        
                        {combo.is_published_to_meli && (
                            <span className="ml-2 px-2 py-1 bg-yellow-600 text-white text-xs rounded">ML</span>
                        )}
                    </div>
                </td>
                
                <td className="px-6 py-4">
                    <div className="flex justify-center items-center gap-2">
                        <button 
                            onClick={() => onEdit(combo)} 
                            className="p-1.5 text-blue-400 hover:text-white hover:bg-blue-500 rounded-md transition-colors" 
                            title="Editar Combo"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path>
                            </svg>
                        </button>
                        
                        {isMeliConnected && (
                            <button 
                                onClick={() => onPublishToMeli(combo)}
                                className="p-1.5 text-yellow-400 hover:text-white hover:bg-yellow-500 rounded-md transition-colors" 
                                title="Publicar en MercadoLibre"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                </svg>
                            </button>
                        )}
                        
                        <button 
                            onClick={() => onDelete(combo)} 
                            className="p-1.5 text-red-400 hover:text-white hover:bg-red-500 rounded-md transition-colors" 
                            title="Eliminar Combo"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
            
            {isExpanded && (
                <tr className="bg-gray-900/50">
                    <td colSpan="8" className="p-0">
                        <div className="p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Información del Combo */}
                                <div>
                                    <h4 className="text-lg font-semibold text-white mb-3">Información del Combo</h4>
                                    <div className="space-y-2 text-sm">
                                        {combo.description && (
                                            <div>
                                                <span className="text-gray-400">Descripción:</span>
                                                <p className="text-gray-300">{combo.description}</p>
                                            </div>
                                        )}
                                        
                                        {combo.category && (
                                            <div>
                                                <span className="text-gray-400">Categoría:</span>
                                                <span className="text-gray-300 ml-2">{combo.category}</span>
                                                {combo.subcategory && (
                                                    <span className="text-gray-400"> / {combo.subcategory}</span>
                                                )}
                                            </div>
                                        )}
                                        
                                        {combo.locations && combo.locations.length > 0 && (
                                            <div>
                                                <span className="text-gray-400">Ubicaciones:</span>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {combo.locations.map((location, idx) => (
                                                        <span key={idx} className="px-2 py-1 bg-purple-600/20 text-purple-300 text-xs rounded">
                                                            {location}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div className="grid grid-cols-2 gap-4 mt-4 p-3 bg-gray-800 rounded">
                                            <div>
                                                <span className="text-gray-400 text-xs">Costo Total:</span>
                                                <p className="text-red-300 font-bold">{formatPrice(combo.total_cost)}</p>
                                            </div>
                                            <div>
                                                <span className="text-gray-400 text-xs">Precio Final:</span>
                                                <p className="text-green-300 font-bold">{formatPrice(combo.final_price)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Componentes del Combo */}
                                <div>
                                    <h4 className="text-lg font-semibold text-white mb-3">Componentes del Combo</h4>
                                    <div className="max-h-64 overflow-y-auto">
                                        <table className="w-full text-sm text-left text-gray-400">
                                            <thead className="text-xs text-gray-300 uppercase bg-gray-700 sticky top-0">
                                                <tr>
                                                    <th className="px-3 py-2">SKU</th>
                                                    <th className="px-3 py-2">Producto</th>
                                                    <th className="px-3 py-2 text-center">Cant.</th>
                                                    <th className="px-3 py-2 text-center">Precio</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-700">
                                                {combo.component_skus && combo.component_skus.map((sku, index) => (
                                                    <ComboComponentRow key={index} sku={sku} comboId={combo.id} />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

// --- COMPONENTE PARA MOSTRAR CADA COMPONENTE DEL COMBO ---
const ComboComponentRow = ({ sku, comboId }) => {
    const [componentData, setComponentData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchComponentData = async () => {
            try {
                const { data, error } = await supabase
                    .from('garaje_combo_items')
                    .select('*')
                    .eq('combo_id', comboId)
                    .eq('product_sku', sku)
                    .single();
                
                if (error) throw error;
                setComponentData(data);
            } catch (error) {
                console.error('Error cargando componente:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchComponentData();
    }, [sku, comboId]);

    const formatPrice = (price) => {
        return new Intl.NumberFormat('es-AR', { 
            style: 'currency', 
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0 
        }).format(price || 0);
    };

    if (loading) {
        return (
            <tr>
                <td colSpan="4" className="px-3 py-2 text-center">
                    <div className="animate-pulse">Cargando...</div>
                </td>
            </tr>
        );
    }

    if (!componentData) {
        return (
            <tr>
                <td colSpan="4" className="px-3 py-2 text-center text-red-400">
                    Error al cargar componente
                </td>
            </tr>
        );
    }

    return (
        <tr>
            <td className="px-3 py-2 font-mono text-xs text-blue-300">{componentData.product_sku}</td>
            <td className="px-3 py-2 text-xs">{componentData.product_name || 'N/A'}</td>
            <td className="px-3 py-2 text-center font-bold text-amber-300">{componentData.quantity}</td>
            <td className="px-3 py-2 text-center text-green-300 text-xs">
                {formatPrice(componentData.sale_price * componentData.quantity)}
            </td>
        </tr>
    );
};

// --- COMPONENTE PRINCIPAL GARAJE ---
const Garaje = () => {
    const { showMessage, isMeliConnected } = useContext(AppContext);
    const [combos, setCombos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterActive, setFilterActive] = useState('all');
    
    // Estados para modales
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [comboToEdit, setComboToEdit] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [comboToDelete, setComboToDelete] = useState(null);
    const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);

    // Cargar combos desde la vista completa
    useEffect(() => {
        const fetchCombos = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('garaje_combos_complete')
                    .select('*')
                    .order('updated_at', { ascending: false });
                
                if (error) throw error;
                setCombos(data || []);
            } catch (error) {
                showMessage(`Error al cargar combos: ${error.message}`, 'error');
            } finally {
                setLoading(false);
            }
        };

        fetchCombos();

        // Suscribirse a cambios en tiempo real
        const subscription = supabase
            .channel('garaje_combos_changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'garaje_combos' }, 
                fetchCombos
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [showMessage]);

    // Filtros de combos
    const filteredCombos = useMemo(() => {
        return combos.filter(combo => {
            const matchesSearch = !searchTerm || 
                combo.combo_sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                combo.combo_name.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesCategory = !filterCategory || combo.category === filterCategory;
            
            const matchesActive = filterActive === 'all' || 
                (filterActive === 'active' && combo.is_active) ||
                (filterActive === 'inactive' && !combo.is_active);
            
            return matchesSearch && matchesCategory && matchesActive;
        });
    }, [combos, searchTerm, filterCategory, filterActive]);

    // Categorías únicas para el filtro
    const uniqueCategories = useMemo(() => {
        const categories = combos.map(combo => combo.category).filter(Boolean);
        return [...new Set(categories)].sort();
    }, [combos]);

    const handleEditCombo = (combo) => {
        setComboToEdit(combo);
        setIsEditModalOpen(true);
    };

    const handleDeleteCombo = async () => {
        if (!comboToDelete) return;
        
        try {
            const { error } = await supabase
                .from('garaje_combos')
                .delete()
                .eq('id', comboToDelete.id);
            
            if (error) throw error;
            showMessage(`Combo "${comboToDelete.combo_name}" eliminado con éxito.`, 'success');
        } catch (error) {
            showMessage(`Error al eliminar combo: ${error.message}`, 'error');
        } finally {
            setComboToDelete(null);
        }
    };

    const handlePublishToMeli = async (combo) => {
        if (!isMeliConnected) {
            showMessage('Necesitas conectar MercadoLibre para publicar combos.', 'warning');
            return;
        }
        
        showMessage(`Funcionalidad de publicación a ML en desarrollo para: ${combo.combo_name}`, 'info');
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
                <h2 className="text-2xl font-bold text-white">🔧 Garaje - Sistema de Combos</h2>
                
                <div className="flex gap-3">
                    <button 
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex items-center"
                        onClick={() => setIsImportExportModalOpen(true)}
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12l2 2 4-4"></path>
                        </svg>
                        Import/Export
                    </button>
                    
                    <button 
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center"
                        onClick={() => setIsCreateModalOpen(true)}
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                        </svg>
                        Crear Nuevo Combo
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-900/50 rounded-lg">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Buscar Combo</label>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                        placeholder="SKU o nombre del combo..."
                    />
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Categoría</label>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    >
                        <option value="">Todas las categorías</option>
                        {uniqueCategories.map(category => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Estado</label>
                    <select
                        value={filterActive}
                        onChange={(e) => setFilterActive(e.target.value)}
                        className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    >
                        <option value="all">Todos</option>
                        <option value="active">Activos</option>
                        <option value="inactive">Inactivos</option>
                    </select>
                </div>
                
                <div className="flex items-end">
                    <div className="w-full">
                        <span className="block text-sm font-medium text-gray-300 mb-1">Total:</span>
                        <span className="text-2xl font-bold text-blue-400">{filteredCombos.length}</span>
                    </div>
                </div>
            </div>

            {/* Tabla de Combos */}
            <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                        <tr>
                            <th scope="col" className="px-4 py-3 w-12"></th>
                            <th scope="col" className="px-6 py-3">Combo</th>
                            <th scope="col" className="px-6 py-3">Marcas</th>
                            <th scope="col" className="px-6 py-3 text-center">Items</th>
                            <th scope="col" className="px-6 py-3 text-center">Stock</th>
                            <th scope="col" className="px-6 py-3 text-center">Precio</th>
                            <th scope="col" className="px-6 py-3 text-center">Estado</th>
                            <th scope="col" className="px-6 py-3 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan="8" className="text-center py-8">
                                    <div className="flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
                                        Cargando combos...
                                    </div>
                                </td>
                            </tr>
                        )}
                        
                        {!loading && filteredCombos.length === 0 && (
                            <tr>
                                <td colSpan="8" className="text-center py-8">
                                    <div className="text-gray-400">
                                        {combos.length === 0 
                                            ? '🔧 No tienes combos creados. ¡Crea el primero!' 
                                            : 'No se encontraron combos con los filtros aplicados.'
                                        }
                                    </div>
                                </td>
                            </tr>
                        )}
                        
                        {!loading && filteredCombos.map(combo => (
                            <ComboRow 
                                key={combo.id} 
                                combo={combo} 
                                onEdit={handleEditCombo}
                                onDelete={setComboToDelete}
                                onPublishToMeli={handlePublishToMeli}
                                isMeliConnected={isMeliConnected}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modales */}
            <CreateComboModal 
                show={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />
            
            <EditComboModal
                show={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                combo={comboToEdit}
            />
            
            <ConfirmDeleteModal 
                item={comboToDelete}
                onCancel={() => setComboToDelete(null)}
                onConfirm={handleDeleteCombo}
                itemType="combo"
            />
            
            <ComboImportExportModal
                show={isImportExportModalOpen}
                onClose={() => setIsImportExportModalOpen(false)}
            />
        </div>
    );
};

export default Garaje;