import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { masterData } from '../masterData'; // Usamos el archivo central que creamos

// Componente FormSelect (sin cambios)
const FormSelect = ({ label, name, value, onChange, options, placeholder, valueKey = 'id', labelKey = 'name' }) => (
    <div>
        <label htmlFor={`edit-${name}`} className="block mb-2 text-sm font-medium text-white">{label}</label>
        <select id={`edit-${name}`} name={name} value={value} onChange={onChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 placeholder-gray-400 text-white">
            <option value="">{placeholder}</option>
            {options && options.map(opt => (
                typeof opt === 'object' 
                ? <option key={opt[valueKey]} value={opt[valueKey]}>{opt[labelKey]}</option> 
                : <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    </div>
);

const EditProductModal = ({ product, onClose, onSave }) => {
    // Ya no necesitamos 'categories' del contexto, usaremos masterData para ser consistentes
    const { suppliers } = useContext(AppContext);
    const [editedProduct, setEditedProduct] = useState(product);
    
    useEffect(() => {
        setEditedProduct(product);
    }, [product]);

    useEffect(() => {
        if (!editedProduct || !suppliers || suppliers.length === 0) return;
        const cost = parseFloat(editedProduct.cost_price) || 0;
        const supplierId = editedProduct.supplier_id;
        
        const supplierRule = suppliers.find(s => s.id === supplierId);
        
        const markupPercentage = supplierRule ? supplierRule.markup : 0;
        const markup = 1 + (markupPercentage / 100);
        const newSalePrice = cost * markup;

        if (Math.abs(newSalePrice - (parseFloat(editedProduct.sale_price) || 0)) > 0.01) {
            setEditedProduct(prev => ({ ...prev, sale_price: newSalePrice.toFixed(2) }));
        }
    }, [editedProduct?.cost_price, editedProduct?.supplier_id, suppliers]);


    const handleChange = (e) => {
        const { name, value } = e.target;
        const isNumeric = name === 'supplier_id';
        const finalValue = isNumeric && value ? parseInt(value, 10) : value;

        const newProductState = { ...editedProduct, [name]: finalValue };

        if (name === 'rubro') {
            newProductState.subrubro = '';
        }
        setEditedProduct(newProductState);
    };

    const handleSave = (e) => {
        e.preventDefault();
        onSave(editedProduct);
    };

    if (!product) return null;
    
    // --- CAMBIO CLAVE: Usamos masterData para Rubros y Subrubros, igual que en ProductEntry ---
    const rubroOptions = Object.keys(masterData.categories);
    const subrubroOptions = editedProduct.rubro && masterData.categories[editedProduct.rubro]
        ? masterData.categories[editedProduct.rubro]
        : [];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-white mb-6">Editar Producto: {product.sku}</h2>
                    <form onSubmit={handleSave} className="space-y-4">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <FormSelect label="Proveedor" name="supplier_id" value={editedProduct.supplier_id || ''} onChange={handleChange} options={suppliers} placeholder="Seleccionar Proveedor" />
                            <FormSelect label="Marca" name="brand" value={editedProduct.brand || ''} onChange={handleChange} options={masterData.brands} placeholder="Seleccionar Marca" />
                            {/* Ahora este usará la lista de masterData */}
                            <FormSelect label="Rubro" name="rubro" value={editedProduct.rubro || ''} onChange={handleChange} options={rubroOptions} placeholder="Seleccionar Rubro" />
                            <FormSelect label="Subrubro" name="subrubro" value={editedProduct.subrubro || ''} onChange={handleChange} options={subrubroOptions} placeholder="Seleccionar Subrubro" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                             <div>
                                <label className="block mb-2 text-sm font-medium text-white">Nombre</label>
                                <input type="text" name="name" value={editedProduct.name || ''} onChange={handleChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" required />
                             </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block mb-2 text-sm font-medium text-white">Costo</label>
                                <input type="number" step="0.01" name="cost_price" value={editedProduct.cost_price || ''} onChange={handleChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" required />
                            </div>
                            <div>
                                <label className="block mb-2 text-sm font-medium text-white">Precio de Venta (Automático)</label>
                                <input type="number" step="0.01" name="sale_price" value={editedProduct.sale_price || ''} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-900/50 border-gray-600 cursor-not-allowed" readOnly />
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-700">
                            <button type="button" onClick={onClose} className="text-white bg-gray-600 hover:bg-gray-700 font-medium rounded-lg text-sm px-5 py-2.5">Cancelar</button>
                            <button type="submit" className="text-white bg-blue-600 hover:bg-blue-700 font-medium rounded-lg text-sm px-5 py-2.5">Guardar Cambios</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default EditProductModal;