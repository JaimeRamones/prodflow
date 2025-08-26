// Ruta: src/components/NewSaleForm.js
import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const NewSaleForm = () => {
    const { products, session, showMessage, kits, fetchProducts, fetchSalesOrders, fetchSupplierOrders } = useContext(AppContext);
    
    const [skuInput, setSkuInput] = useState('');
    const [quantityInput, setQuantityInput] = useState('1');
    const [saleType, setSaleType] = useState('mercado_envios');
    const [currentStockDisplay, setCurrentStockDisplay] = useState('N/A');
    const [skuSuggestions, setSkuSuggestions] = useState([]);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);

    const quantitySaleInputRef = useRef(null);
    const skuSaleInputRef = useRef(null);

    // --- Toda la lógica para mostrar stock y sugerencias se mantiene, ya funcionaba bien ---
    useEffect(() => {
        if (!Array.isArray(products) || !Array.isArray(kits)) return;
        const checkStock = () => {
            if (!skuInput) { setCurrentStockDisplay('N/A'); return; }
            const upperSku = skuInput.toUpperCase();
            const foundProduct = products.find(p => p.sku.toUpperCase() === upperSku);
            const foundKit = kits.find(k => k.sku.toUpperCase() === upperSku);
            if (foundProduct) { setCurrentStockDisplay(foundProduct.stock_disponible || 0); }
            else if (foundKit) {
                if (foundKit.components && foundKit.components.length > 0) {
                    const stockLevels = foundKit.components.map(c => {
                        const product = products.find(p => p.id === c.product_id);
                        if (!product) return 0;
                        return Math.floor((product.stock_disponible || 0) / c.quantity);
                    });
                    setCurrentStockDisplay(Math.min(...stockLevels));
                } else { setCurrentStockDisplay(0); }
            } else { setCurrentStockDisplay('N/A'); }
        };
        checkStock();
    }, [skuInput, products, kits]);

    const handleSkuInputChange = useCallback((e) => {
        const value = e.target.value;
        setSkuInput(value);
        if (value.length > 1) {
            const upperValue = value.toUpperCase();
            const productResults = products.filter(p => p.sku.toUpperCase().includes(upperValue) || p.name?.toUpperCase().includes(upperValue)).map(p => ({ ...p, isKit: false }));
            const kitResults = kits.filter(k => k.sku.toUpperCase().includes(upperValue) || k.name?.toUpperCase().includes(upperValue)).map(k => ({ ...k, isKit: true }));
            setSkuSuggestions([...kitResults, ...productResults].slice(0, 7));
        } else { setSkuSuggestions([]); }
    }, [products, kits]);

    const handleSelectSuggestion = useCallback((item) => {
        setSkuInput(item.sku);
        setSkuSuggestions([]);
        quantitySaleInputRef.current?.focus();
    }, []);

    const handleKeyDownOnSkuInput = useCallback((e) => {
        if (skuSuggestions.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestionIndex(prev => Math.min(prev + 1, skuSuggestions.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestionIndex(prev => Math.max(prev - 1, 0)); }
            else if (e.key === 'Enter' && activeSuggestionIndex > -1) { e.preventDefault(); handleSelectSuggestion(skuSuggestions[activeSuggestionIndex]); }
        }
    }, [activeSuggestionIndex, skuSuggestions, handleSelectSuggestion]);

    // --- ¡AQUÍ ESTÁ EL CAMBIO PRINCIPAL! ---
    const handleRegisterSale = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        const quantitySold = parseInt(quantityInput, 10);
        const skuToSell = skuInput.trim().toUpperCase();

        if (!skuToSell || isNaN(quantitySold) || quantitySold <= 0) {
            showMessage("Introduce un SKU y una cantidad válida.", "error");
            setIsLoading(false);
            return;
        }

        const foundProduct = products.find(p => p.sku.toUpperCase() === skuToSell);
        if (!foundProduct) {
            showMessage(`El producto con SKU "${skuToSell}" no existe en tu inventario.`, "error");
            setIsLoading(false);
            return;
        }
        
        // 1. Crear la orden de venta principal en `sales_orders`
        const totalAmount = (foundProduct.sale_price || 0) * quantitySold;
        const { data: newOrder, error: orderError } = await supabase
            .from('sales_orders')
            .insert({
                user_id: session.user.id,
                status: 'paid', // O el estado que prefieras para ventas manuales
                shipping_type: saleType,
                total_amount: totalAmount,
                buyer_name: 'Venta Manual', // Dato genérico
            })
            .select()
            .single();

        if (orderError) {
            showMessage(`Error al crear la orden: ${orderError.message}`, 'error');
            setIsLoading(false);
            return;
        }

        // 2. Crear el item de la orden en `order_items`
        const { error: itemError } = await supabase
            .from('order_items')
            .insert({
                order_id: newOrder.id,
                sku: foundProduct.sku,
                title: foundProduct.name, // Usamos el nombre del producto
                quantity: quantitySold,
                unit_price: foundProduct.sale_price,
                thumbnail_url: foundProduct.image_url, // Usamos la imagen del producto
                product_id: foundProduct.id,
                name: foundProduct.name,
                sale_price: foundProduct.sale_price,
            });

        if (itemError) {
            // Si esto falla, idealmente deberíamos borrar la orden que creamos, pero por ahora solo mostramos el error.
            showMessage(`Error al guardar los artículos de la orden: ${itemError.message}`, 'error');
            setIsLoading(false);
            return;
        }

        showMessage("Venta manual registrada con éxito en Supabase.", "success");
        
        // 3. Actualizar el stock del producto
        const newStock = (foundProduct.stock_disponible || 0) - quantitySold;
        const { error: stockError } = await supabase
            .from('products')
            .update({ stock_disponible: newStock })
            .eq('id', foundProduct.id);
        
        if (stockError) {
             showMessage(`Venta registrada, pero hubo un error al actualizar el stock: ${stockError.message}`, 'warning');
        }

        // 4. Refrescar todos los datos de la app
        await Promise.all([ fetchProducts(), fetchSalesOrders(), fetchSupplierOrders() ]);
        setSkuInput('');
        setQuantityInput('1');
        skuSaleInputRef.current?.focus();
        setIsLoading(false);
    };

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-8 max-w-xl mx-auto">
            {/* ... El resto del JSX (la parte visual del formulario) se mantiene exactamente igual ... */}
            <h3 className="text-xl font-semibold text-white mb-3">Registrar Nueva Venta</h3>
            <form onSubmit={handleRegisterSale} className="space-y-3">
                 <div className="relative">
                    <label htmlFor="saleSku" className="block mb-1 text-sm font-medium text-gray-300">SKU (Producto o Kit)</label>
                    <div className="flex items-center gap-2">
                        <input type="text" id="saleSku" ref={skuSaleInputRef} className="border text-sm rounded-lg block w-full p-2 bg-gray-700 border-gray-600" value={skuInput} onChange={handleSkuInputChange} onKeyDown={handleKeyDownOnSkuInput} required autoComplete="off" />
                        {skuInput && <div className="flex-shrink-0 bg-blue-900/50 text-blue-300 px-3 py-2 rounded-lg font-bold text-sm">Disp: {currentStockDisplay}</div>}
                    </div>
                    {skuSuggestions.length > 0 && (
                        <ul className="absolute z-10 w-full bg-gray-700 border border-gray-600 rounded-lg mt-1 max-h-48 overflow-y-auto shadow-lg">
                            {skuSuggestions.map((item, index) => (
                                <li key={item.id} className={`px-4 py-2 hover:bg-gray-600 cursor-pointer text-sm ${index === activeSuggestionIndex ? 'bg-blue-900/50' : ''}`} onClick={() => handleSelectSuggestion(item)}>
                                    <span className="text-white">{item.sku}</span> - <span className="text-gray-400">{item.name}</span>
                                    {item.isKit && <span className="text-xs bg-indigo-500 text-white font-semibold px-2 py-0.5 rounded-full ml-2">KIT</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div>
                    <label htmlFor="saleQuantity" className="block mb-1 text-sm font-medium text-gray-300">Cantidad Vendida</label>
                    <input type="number" id="saleQuantity" ref={quantitySaleInputRef} className="border text-sm rounded-lg block w-full p-2 bg-gray-700 border-gray-600" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} min="1" required />
                </div>
                <div>
                    <label htmlFor="saleType" className="block mb-1 text-sm font-medium text-gray-300">Tipo de Venta</label>
                    <select id="saleType" className="border text-sm rounded-lg block w-full p-2 bg-gray-700 border-gray-600" value={saleType} onChange={(e) => setSaleType(e.target.value)} required>
                        <option value="mercado_envios">Mercado Envíos</option>
                        <option value="flex">Flex</option>
                        <option value="manual">Manual</option>
                    </select>
                </div>
                <button type="submit" disabled={isLoading} className="w-full px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg disabled:bg-gray-600">
                    {isLoading ? 'Registrando...' : 'Registrar Venta'}
                </button>
            </form>
        </div>
    );
};

export default NewSaleForm;