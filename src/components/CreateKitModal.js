import React, { useState, useContext, useMemo } from 'react';
import { AppContext } from '../App';

// Formulario emergente para crear y definir los componentes de un nuevo kit.
const CreateKitModal = ({ show, onClose, onSave }) => {
    const { products } = useContext(AppContext);

    // Estados para los datos del kit
    const [kitSku, setKitSku] = useState('');
    const [kitName, setKitName] = useState('');
    const [components, setComponents] = useState([]); // Lista de productos que componen el kit

    // Estados para la búsqueda de componentes
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filtra los productos para la búsqueda de componentes
    const searchResults = useMemo(() => {
        if (searchTerm.length < 2) return [];
        const lowerCaseSearch = searchTerm.toLowerCase();
        return products
            .filter(p => p.sku.toLowerCase().includes(lowerCaseSearch) || p.name.toLowerCase().includes(lowerCaseSearch))
            .slice(0, 5); // Mostramos solo los primeros 5 resultados
    }, [searchTerm, products]);

    const addComponent = (product) => {
        // Evita añadir el mismo componente dos veces
        if (components.find(c => c.id === product.id)) return;
        setComponents([...components, { ...product, quantity: 1 }]);
        setSearchTerm(''); // Limpia la búsqueda
    };

    const updateComponentQuantity = (productId, newQuantity) => {
        const quantity = parseInt(newQuantity, 10);
        if (isNaN(quantity) || quantity < 1) return;
        setComponents(components.map(c => c.id === productId ? { ...c, quantity } : c));
    };

    const removeComponent = (productId) => {
        setComponents(components.filter(c => c.id !== productId));
    };

    const handleSave = async () => {
        if (!kitSku || !kitName || components.length === 0) {
            alert("El SKU, el Nombre y al menos un componente son obligatorios.");
            return;
        }
        setIsSubmitting(true);
        // Preparamos los datos del kit para guardarlos
        const kitData = {
            sku: kitSku.toUpperCase(),
            name: kitName,
            components: components.map(c => ({
                productId: c.id,
                sku: c.sku,
                name: c.name,
                quantity: c.quantity
            }))
        };
        await onSave(kitData);
        setIsSubmitting(false);
        onClose(); // Cierra el modal después de guardar
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-700">
                    <h2 className="text-2xl font-bold text-white">Crear Nuevo Kit</h2>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-grow">
                    {/* Datos principales del Kit */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block mb-1 text-sm font-medium text-gray-300">SKU del Kit</label>
                            <input type="text" value={kitSku} onChange={e => setKitSku(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" />
                        </div>
                        <div>
                            <label className="block mb-1 text-sm font-medium text-gray-300">Nombre del Kit</label>
                            <input type="text" value={kitName} onChange={e => setKitName(e.target.value)} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white" />
                        </div>
                    </div>

                    {/* Buscador de Componentes */}
                    <div className="relative">
                        <label className="block mb-1 text-sm font-medium text-gray-300">Añadir Componente (buscar por SKU o Nombre)</label>
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

                    {/* Tabla de Componentes Añadidos */}
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
                                        <tr key={c.id}>
                                            <td className="px-4 py-2 font-medium text-white">{c.sku}</td>
                                            <td className="px-4 py-2">{c.name}</td>
                                            <td className="px-4 py-2">
                                                <input type="number" value={c.quantity} onChange={e => updateComponentQuantity(c.id, e.target.value)} className="w-full p-1 text-center bg-gray-900 border border-gray-600 rounded-md text-white" min="1" />
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <button onClick={() => removeComponent(c.id)} className="text-red-400 hover:text-red-600">
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
                        {isSubmitting ? 'Guardando...' : 'Guardar Kit'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateKitModal;
