import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { db } from '../firebaseConfig';
import { collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import CreateKitModal from './CreateKitModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import EditKitModal from './EditKitModal'; // 1. Importamos el nuevo modal de edición

// --- SUB-COMPONENTE PARA CADA FILA DE KIT (CON VISTA DESPLEGABLE) ---
const KitRow = ({ kit, onEdit, onDelete }) => {
    const { products } = useContext(AppContext);
    const [isExpanded, setIsExpanded] = useState(false);

    const armableStock = useMemo(() => {
        if (!kit.components || kit.components.length === 0) return 0;
        const stockLevels = kit.components.map(component => {
            const product = products.find(p => p.id === component.productId);
            if (!product) return 0;
            return Math.floor((product.stockDisponible || 0) / component.quantity);
        });
        return Math.min(...stockLevels);
    }, [kit.components, products]);

    return (
        <>
            <tr className="bg-gray-800 border-b border-gray-700 hover:bg-gray-700/50">
                <td className="px-4 py-2 text-center">
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded-full hover:bg-gray-600">
                        <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                    </button>
                </td>
                <th scope="row" className="px-6 py-4 font-medium text-white whitespace-nowrap">{kit.sku}</th>
                <td className="px-6 py-4">{kit.name}</td>
                <td className="px-6 py-4 text-center">{kit.components?.length || 0}</td>
                <td className="px-6 py-4 text-center font-bold text-green-400">{armableStock}</td>
                <td className="px-6 py-4">
                    <div className="flex justify-center items-center gap-3">
                        <button onClick={() => onEdit(kit)} className="p-1.5 text-blue-400 hover:text-white hover:bg-blue-500 rounded-md transition-colors" title="Editar Kit">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg>
                        </button>
                        <button onClick={() => onDelete(kit)} className="p-1.5 text-red-400 hover:text-white hover:bg-red-500 rounded-md transition-colors" title="Eliminar Kit">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
            {isExpanded && (
                <tr className="bg-gray-900/50">
                    <td colSpan="6" className="p-0">
                        <div className="p-4">
                            <h4 className="text-md font-semibold text-white mb-2">Componentes del Kit:</h4>
                            <table className="w-full text-sm text-left text-gray-400">
                                <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                                    <tr>
                                        <th className="px-4 py-2">SKU Componente</th>
                                        <th className="px-4 py-2">Nombre</th>
                                        <th className="px-4 py-2 text-center">Cantidad Requerida</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {kit.components.map((c, index) => (
                                        <tr key={index}>
                                            <td className="px-4 py-2 font-medium text-gray-300">{c.sku}</td>
                                            <td className="px-4 py-2">{c.name}</td>
                                            <td className="px-4 py-2 text-center font-bold text-amber-300">{c.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

// --- COMPONENTE PRINCIPAL DE LA PÁGINA DE KITS ---
const Kits = () => {
    const { showMessage } = useContext(AppContext);
    const [kits, setKits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [kitToDelete, setKitToDelete] = useState(null);
    const [kitToEdit, setKitToEdit] = useState(null); // 2. Estado para el kit a editar
    const [isEditModalOpen, setIsEditModalOpen] = useState(false); // Estado para controlar el modal de edición

    useEffect(() => {
        setLoading(true);
        const kitsCollectionRef = collection(db, 'kits');
        const unsubscribe = onSnapshot(kitsCollectionRef, (snapshot) => {
            const kitsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setKits(kitsData);
            setLoading(false);
        }, (error) => {
            showMessage(`Error al cargar los kits: ${error.message}`, 'error');
            setLoading(false);
        });
        return () => unsubscribe();
    }, [showMessage]);

    const handleSaveKit = async (kitData) => {
        try {
            await addDoc(collection(db, 'kits'), { ...kitData, createdAt: serverTimestamp() });
            showMessage(`Kit ${kitData.sku} creado con éxito.`, 'success');
        } catch (error) {
            showMessage(`Error al guardar el kit: ${error.message}`, 'error');
        }
    };

    const handleDeleteKit = async () => {
        if (!kitToDelete) return;
        try {
            await deleteDoc(doc(db, 'kits', kitToDelete.id));
            showMessage(`Kit ${kitToDelete.sku} eliminado con éxito.`, 'success');
        } catch (error) {
            showMessage(`Error al eliminar el kit: ${error.message}`, 'error');
        } finally {
            setKitToDelete(null);
        }
    };

    // 3. Función para abrir el modal de edición
    const handleEditKit = (kit) => {
        setKitToEdit(kit);
        setIsEditModalOpen(true);
    };

    // 4. Función para guardar los cambios del kit editado
    const handleUpdateKit = async (kitId, updatedData) => {
        try {
            const kitRef = doc(db, 'kits', kitId);
            await updateDoc(kitRef, {
                ...updatedData,
                updatedAt: serverTimestamp()
            });
            showMessage('Kit actualizado con éxito.', 'success');
        } catch (error) {
            showMessage(`Error al actualizar el kit: ${error.message}`, 'error');
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Gestión de Kits</h2>
                <button 
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center"
                    onClick={() => setIsCreateModalOpen(true)}
                >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    Crear Nuevo Kit
                </button>
            </div>
            
            <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                        <tr>
                            <th scope="col" className="px-4 py-3 w-12"></th>
                            <th scope="col" className="px-6 py-3">SKU del Kit</th>
                            <th scope="col" className="px-6 py-3">Nombre del Kit</th>
                            <th scope="col" className="px-6 py-3 text-center">Nº Comp.</th>
                            <th scope="col" className="px-6 py-3 text-center">Stock Armable</th>
                            <th scope="col" className="px-6 py-3 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan="6" className="text-center py-4">Cargando kits...</td></tr>
                        )}
                        {!loading && kits.length === 0 && (
                            <tr><td colSpan="6" className="text-center py-4">No se encontraron kits. ¡Crea el primero!</td></tr>
                        )}
                        {!loading && kits.map(kit => (
                            <KitRow 
                                key={kit.id} 
                                kit={kit} 
                                onEdit={handleEditKit}
                                onDelete={setKitToDelete}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            <CreateKitModal 
                show={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleSaveKit}
            />
            <ConfirmDeleteModal 
                item={kitToDelete}
                onCancel={() => setKitToDelete(null)}
                onConfirm={handleDeleteKit}
                itemType="kit"
            />
            {/* 5. Renderizamos el nuevo modal de edición */}
            <EditKitModal
                show={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onSave={handleUpdateKit}
                kit={kitToEdit}
            />
        </div>
    );
};

export default Kits;
