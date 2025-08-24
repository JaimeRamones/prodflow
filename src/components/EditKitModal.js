import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../App';

// Formulario emergente para editar un kit existente.
const EditKitModal = ({ show, onClose, onSave, kit }) => {
    const { products } = useContext(AppContext);

    // Estados para los datos del kit, inicializados con los datos del kit a editar
    const [kitSku, setKitSku] = useState('');
    const [kitName, setKitName] = useState('');
    const [components, setComponents] = useState([]);

    // Estados para la búsqueda de componentes
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Cuando el modal se abre, cargamos los datos del kit seleccionado
    useEffect(() => {
        if (kit) {
            setKitSku(kit.sku || '');
            setKitName(kit.name || '');
            setComponents(kit.components || []);
        }
    }, [kit]);

    const searchResults = useMemo(() => {
        if (searchTerm.length < 2) return [];
        const lowerCaseSearch = searchTerm.toLowerCase();
        return products
            .filter(p => p.sku.toLowerCase().includes(lowerCaseSearch) || p.name.toLowerCase().includes(lowerCaseSearch))
            .slice(0, 5);
    }, [searchTerm, products]);

    const addComponent = (product) => {
        if (components.find(c => c.productId === product.id)) return;
        // El formato de componente en el kit es diferente al del producto completo
        setComponents([...components, { 
            productId: product.id, 
            sku: product.sku,
            name: product.name,
            quantity: 1 
        }]);
        setSearchTerm('');
    };

    const updateComponentQuantity = (productId, newQuantity) => {
        const quantity = parseInt(newQuantity, 10);
        if (isNaN(quantity) || quantity < 1) return;
        setComponents(components.map(c => c.productId === productId ? { ...c, quantity } : c));
    };

    const removeComponent = (productId) => {
        setComponents(components.filter(c => c.productId !== productId));
    };

    const handleSave = async () => {
        if (!kitName || components.length === 0) {
            alert("El Nombre y al menos un componente son obligatorios.");
            return;
        }
        setIsSubmitting(true);
        const updatedKitData = {
            // No permitimos cambiar el SKU para evitar inconsistencias
            name: kitName,
            components: components.map(c => ({
                productId: c.productId,
                sku: c.sku,
                name: c.name,
                quantity: c.quantity
            }))
        };
        await onSave(kit.id, updatedKitData);
        setIsSubmitting(false);
        onClose();
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-700">
                    <h2 className="text-2xl font-bold text-white">Editar Kit: <span className="text-blue-400">{kit.sku}</span></h2>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-grow">
                    <div>
                        <label className="block mb-1 text-sm font-medium text-gray-300">Nombre del Kit</label>
                        <input type="text" value={kitName} onChange={e => setKitName(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" />
                    </div>

                    <div className="relative">
                        <label className="block mb-1 text-sm font-medium text-gray-300">Añadir Componente</label>
                        <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" placeholder="Buscar producto..." />
                        {searchResults.length > 0 && (
                            <ul className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-md shadow-lg">
                                {searchResults.map(p => (
                                    <li key={p.id} onClick={() => addComponent(p)} className="px-4 py-2 text-white hover:bg-gray-600 cursor-pointer">
                                        {p.sku} - {p.name}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold text-white mt-4">Componentes del Kit ({components.length})</h3>
                        <div className="mt-2 border border-gray-700 rounded-lg overflow-hidden">
                            <table className="w-full text-sm text-left text-gray-400">
                                <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                                    <tr>
                                        <th className="px-4 py-2">SKU</th>
                                        <th className="px-4 py-2">Nombre</th>
                                        <th className="px-4 py-2 w-24 text-center">Cantidad</th>
                                        <th className="px-4 py-2 w-16 text-center">Quitar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {components.map(c => (
                                        <tr key={c.productId}>
                                            <td className="px-4 py-2 font-medium text-white">{c.sku}</td>
                                            <td className="px-4 py-2">{c.name}</td>
                                            <td className="px-4 py-2">
                                                <input type="number" value={c.quantity} onChange={e => updateComponentQuantity(c.productId, e.target.value)} className="w-full p-1 text-center bg-gray-900 border border-gray-600 rounded-md text-white" min="1" />
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <button onClick={() => removeComponent(c.productId)} className="text-red-400 hover:text-red-600">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex justify-end gap-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700">Cancelar</button>
                    <button onClick={handleSave} disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-500">
                        {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditKitModal;
