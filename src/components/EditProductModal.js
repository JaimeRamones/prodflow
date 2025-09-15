// Ruta: src/components/EditProductModal.js

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { masterData } from '../masterData';

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
        // Campos numéricos
        const isNumeric = name === 'supplier_id' || name === 'stock_total' || name === 'stock_reservado';
        
        let finalValue;
        if (name === 'cost_price') {
            finalValue = value; 
        } else if (isNumeric) {
            finalValue = value ? parseInt(value, 10) : 0;
        } else {
            finalValue = value;
        }

        const newProductState = { ...editedProduct, [name]: finalValue };

        if (name === 'rubro') {
            newProductState.subrubro = '';
        }
        setEditedProduct(newProductState);
    };

    // Función para resetear stock reservado a 0
    const handleResetReservedStock = () => {
        setEditedProduct(prev => ({ ...prev, stock_reservado: 0 }));
    };

    const handleSave = (e) => {
        e.preventDefault();
        // Nos aseguramos de NO enviar 'stock_disponible' para que la DB lo calcule
        const productToSave = { ...editedProduct };
        delete productToSave.stock_disponible;

        onSave(productToSave);
    };

    if (!product) return null;
    
    const rubroOptions = Object.keys(masterData.categories);
    const subrubroOptions = editedProduct.rubro && masterData.categories[editedProduct.rubro]
        ? masterData.categories[editedProduct.rubro]
        : [];

    // Calcular stock disponible en tiempo real para mostrar
    const stockTotal = parseInt(editedProduct.stock_total) || 0;
    const stockReservado = parseInt(editedProduct.stock_reservado) || 0;
    const stockDisponibleCalculado = stockTotal - stockReservado;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-white mb-6">Editar Producto: {product.sku}</h2>
                    <form onSubmit={handleSave} className="space-y-4">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <FormSelect label="Proveedor" name="supplier_id" value={editedProduct.supplier_id || ''} onChange={handleChange} options={suppliers} placeholder="Seleccionar Proveedor" />
                            <FormSelect label="Marca" name="brand" value={editedProduct.brand || ''} onChange={handleChange} options={masterData.brands} placeholder="Seleccionar Marca" />
                            <FormSelect label="Rubro" name="rubro" value={editedProduct.rubro || ''} onChange={handleChange} options={rubroOptions} placeholder="Seleccionar Rubro" />
                            <FormSelect label="Subrubro" name="subrubro" value={editedProduct.subrubro || ''} onChange={handleChange} options={subrubroOptions} placeholder="Seleccionar Subrubro" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                             <div>
                                <label className="block mb-2 text-sm font-medium text-white">Nombre</label>
                                <input type="text" name="name" value={editedProduct.name || ''} onChange={handleChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" required />
                             </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block mb-2 text-sm font-medium text-white">Costo</label>
                                <input type="number" step="0.01" name="cost_price" value={editedProduct.cost_price || ''} onChange={handleChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" required />
                            </div>
                            <div>
                                <label className="block mb-2 text-sm font-medium text-white">Precio de Venta (Automático)</label>
                                <input type="number" step="0.01" name="sale_price" value={editedProduct.sale_price || ''} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-900/50 border-gray-600 cursor-not-allowed" readOnly />
                            </div>
                        </div>

                        {/* NUEVA SECCIÓN: Gestión de Stock */}
                        <div className="pt-4 border-t border-gray-700">
                            <h3 className="text-lg font-semibold text-white mb-4">Gestión de Stock</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                {/* Stock Total */}
                                <div>
                                    <label className="block mb-2 text-sm font-medium text-white">Stock Total</label>
                                    <input 
                                        type="number" 
                                        name="stock_total" 
                                        value={editedProduct.stock_total || ''} 
                                        onChange={handleChange} 
                                        className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" 
                                        min="0"
                                    />
                                </div>

                                {/* Stock Reservado */}
                                <div>
                                    <label className="block mb-2 text-sm font-medium text-white">Stock Reservado</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="number" 
                                            name="stock_reservado" 
                                            value={editedProduct.stock_reservado || 0} 
                                            onChange={handleChange} 
                                            className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600" 
                                            min="0"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleResetReservedStock}
                                            className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded-lg transition-colors whitespace-nowrap"
                                            title="Resetear a 0"
                                        >
                                            Reset
                                        </button>
                                    </div>
                                </div>

                                {/* Stock Disponible (Calculado) */}
                                <div>
                                    <label className="block mb-2 text-sm font-medium text-white">Stock Disponible (Calculado)</label>
                                    <input 
                                        type="number" 
                                        value={stockDisponibleCalculado} 
                                        className={`border text-sm rounded-lg block w-full p-2.5 bg-gray-900/50 border-gray-600 cursor-not-allowed ${
                                            stockDisponibleCalculado < 0 ? 'text-red-400' : 'text-green-400'
                                        }`}
                                        readOnly 
                                    />
                                    {stockDisponibleCalculado < 0 && (
                                        <p className="text-xs text-red-400 mt-1">
                                            ⚠️ Stock negativo: Revisa las reservas
                                        </p>
                                    )}
                                </div>

                                {/* Información adicional */}
                                <div className="flex flex-col justify-center">
                                    <div className="text-xs text-gray-400 space-y-1">
                                        <div>Fórmula:</div>
                                        <div className="font-mono">Disponible = Total - Reservado</div>
                                        <div className="font-mono">{stockDisponibleCalculado} = {stockTotal} - {stockReservado}</div>
                                    </div>
                                </div>
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