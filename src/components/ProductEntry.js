import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import { masterData } from '../masterData';

const FormSelect = ({ label, name, value, onChange, options, placeholder, disabled = false, valueKey = 'id', labelKey = 'name' }) => (
    <div>
        <label htmlFor={`entry-${label}`} className="block mb-2 text-sm font-medium text-gray-300">{label}</label>
        <select id={`entry-${label}`} name={name} value={value} onChange={onChange} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 disabled:bg-gray-600" disabled={disabled}>
            <option value="">{placeholder}</option>
            {options.map(opt => (
                typeof opt === 'object' 
                ? <option key={opt[valueKey]} value={opt[valueKey]}>{opt[labelKey]}</option>
                : <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    </div>
);

const ProductEntry = () => {
    const { showMessage, products, suppliers } = useContext(AppContext);
    
    const [sku, setSku] = useState('');
    const [name, setName] = useState('');
    const [brand, setBrand] = useState('');
    const [supplierId, setSupplierId] = useState(''); 
    const [rubro, setRubro] = useState('');
    const [subrubro, setSubrubro] = useState('');
    const [quantity, setQuantity] = useState('');
    
    const [isExistingProduct, setIsExistingProduct] = useState(false);
    const [foundProduct, setFoundProduct] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const trimmedSku = sku.trim();
        if (trimmedSku === '') {
            clearForm(true);
            return;
        }

        const product = products.find(p => p.sku.toLowerCase() === trimmedSku.toLowerCase());
        
        if (product) {
            // Si el producto ya existe, cargamos sus datos como antes
            setName(product.name || '');
            setBrand(product.brand || '');
            setSupplierId(product.supplier_id || '');
            setRubro(product.rubro || '');
            setSubrubro(product.subrubro || '');
            setIsExistingProduct(true);
            setFoundProduct(product);
        } else {
            // --- INICIO DE LA NUEVA LÓGICA DE AUTOCOMPLETADO ---
            if(isExistingProduct) {
               clearForm(true);
            }
            setIsExistingProduct(false);
            setFoundProduct(null);

            let matchedBrand = '';
            let remainingSku = trimmedSku;

            // Buscamos si el SKU comienza con alguna de las marcas conocidas
            for (const b of masterData.brands) {
                if (trimmedSku.toLowerCase().startsWith(b.toLowerCase() + ' ')) {
                    matchedBrand = b;
                    // El resto del SKU será el nombre/número de pieza
                    remainingSku = trimmedSku.substring(b.length).trim();
                    break; 
                }
            }

            if (matchedBrand) {
                setBrand(matchedBrand);
                setName(remainingSku); // Autocompletamos el nombre con el resto del SKU
            } else {
                // Si no hay coincidencia, el nombre se queda vacío para que lo llenes
                setName('');
                setBrand('');
            }
            // --- FIN DE LA NUEVA LÓGICA ---
        }
    }, [sku, products]);

    const clearForm = (keepSku = false) => {
        if (!keepSku) setSku('');
        setName('');
        setBrand('');
        setSupplierId('');
        setRubro('');
        setSubrubro('');
        setQuantity('');
        setIsExistingProduct(false);
        setFoundProduct(null);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'rubro') { setRubro(value); setSubrubro(''); } 
        else if (name === 'brand') { setBrand(value); } 
        else if (name === 'supplierId') { setSupplierId(value); } 
        else if (name === 'subrubro') { setSubrubro(value); }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const stockToAdd = parseInt(quantity, 10);
        if (!sku || !name || !brand || !rubro || !subrubro || !supplierId || !quantity || isNaN(stockToAdd) || stockToAdd <= 0) {
            showMessage("Todos los campos son obligatorios y la cantidad debe ser válida.", 'error');
            return;
        }
        setIsSubmitting(true);
        try {
            if (isExistingProduct && foundProduct) {
                const newStockTotal = (foundProduct.stock_total || 0) + stockToAdd;
                const newStockDisponible = (foundProduct.stock_disponible || 0) + stockToAdd;
                const { error } = await supabase
                    .from('products')
                    .update({ stock_total: newStockTotal, stock_disponible: newStockDisponible })
                    .eq('id', foundProduct.id);
                if (error) throw error;
                showMessage(`Stock añadido al SKU ${sku.toUpperCase()} con éxito.`, 'success');
            } else {
                const newProductData = {
                    sku: sku.toUpperCase(), name, brand, supplier_id: supplierId,
                    rubro, subrubro, stock_total: stockToAdd, stock_reservado: 0,
                    stock_disponible: stockToAdd, cost_price: 0, sale_price: 0,
                };
                const { error } = await supabase.from('products').insert([newProductData]);
                if (error) throw error;
                showMessage(`Producto ${sku.toUpperCase()} creado y añadido al stock con éxito.`, 'success');
            }
            clearForm();
        } catch (error) {
            showMessage(`Error al registrar la entrada: ${error.message}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const subrubroOptions = rubro ? masterData.categories[rubro] || [] : [];

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-6">Registrar Entrada de Producto</h2>
            <div className="p-6 bg-gray-800 rounded-lg shadow-md">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-300">SKU</label>
                        <input type="text" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} placeholder="Ingresa o escanea el SKU" required className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600"/>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <FormSelect label="Proveedor" name="supplierId" value={supplierId} onChange={handleChange} options={suppliers} placeholder="Seleccionar" disabled={isExistingProduct} />
                        <FormSelect label="Marca" name="brand" value={brand} onChange={handleChange} options={masterData.brands} placeholder="Seleccionar" disabled={isExistingProduct} />
                        <FormSelect label="Rubro" name="rubro" value={rubro} onChange={handleChange} options={Object.keys(masterData.categories)} placeholder="Seleccionar" disabled={isExistingProduct} />
                        <FormSelect label="Subrubro" name="subrubro" value={subrubro} onChange={handleChange} options={subrubroOptions} placeholder="Seleccionar" disabled={isExistingProduct} />
                    </div>

                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-300">Nombre del Producto</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre descriptivo" required disabled={isExistingProduct} className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600 disabled:bg-gray-600"/>
                    </div>
                    
                    <div>
                        <label className="block mb-2 text-sm font-medium text-gray-300">Cantidad a Ingresar</label>
                        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Ej: 10" required className="border text-sm rounded-lg block w-full p-2.5 bg-gray-700 border-gray-600"/>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button type="submit" disabled={isSubmitting} className="text-white focus:ring-4 font-medium rounded-lg text-sm px-5 py-2.5 text-center bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                            {isSubmitting ? 'Guardando...' : (isExistingProduct ? 'Añadir Stock' : 'Crear y Añadir Stock')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProductEntry;