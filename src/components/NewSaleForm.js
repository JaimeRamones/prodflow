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

    useEffect(() => {
        if (!Array.isArray(products) || !Array.isArray(kits)) return;

        const checkStock = () => {
            if (!skuInput) {
                setCurrentStockDisplay('N/A');
                return;
            }
            const upperSku = skuInput.toUpperCase();
            const foundProduct = products.find(p => p.sku.toUpperCase() === upperSku);
            const foundKit = kits.find(k => k.sku.toUpperCase() === upperSku);

            if (foundProduct) {
                setCurrentStockDisplay(foundProduct.stock_disponible || 0);
            } else if (foundKit) {
                if (foundKit.components && foundKit.components.length > 0) {
                    const stockLevels = foundKit.components.map(component => {
                        const product = products.find(p => p.id === component.product_id);
                        if (!product) return 0;
                        return Math.floor((product.stock_disponible || 0) / component.quantity);
                    });
                    setCurrentStockDisplay(Math.min(...stockLevels));
                } else {
                    setCurrentStockDisplay(0);
                }
            } else {
                setCurrentStockDisplay('N/A');
            }
        };
        checkStock();
    }, [skuInput, products, kits]);

    const handleSkuInputChange = useCallback((e) => {
        const value = e.target.value;
        setSkuInput(value);
        setActiveSuggestionIndex(-1);
        if (value.length > 1) {
            const upperValue = value.toUpperCase();
            const productResults = products.filter(p => p.sku.toUpperCase().includes(upperValue) || (p.name && p.name.toUpperCase().includes(upperValue))).map(p => ({ ...p, isKit: false }));
            const kitResults = kits.filter(k => k.sku.toUpperCase().includes(upperValue) || (k.name && k.name.toUpperCase().includes(upperValue))).map(k => ({ ...k, isKit: true }));
            setSkuSuggestions([...kitResults, ...productResults].slice(0, 7));
        } else {
            setSkuSuggestions([]);
        }
    }, [products, kits]);

    const handleSelectSuggestion = useCallback((item) => {
        setSkuInput(item.sku);
        setSkuSuggestions([]);
        quantitySaleInputRef.current?.focus();
    }, []);

    const handleKeyDownOnSkuInput = useCallback((e) => {
        if (skuSuggestions.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestionIndex(prev => prev < skuSuggestions.length - 1 ? prev + 1 : prev); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestionIndex(prev => prev > 0 ? prev - 1 : 0); }
            else if (e.key === 'Enter' && activeSuggestionIndex > -1) { e.preventDefault(); handleSelectSuggestion(skuSuggestions[activeSuggestionIndex]); }
        }
    }, [activeSuggestionIndex, skuSuggestions, handleSelectSuggestion]);

    const handleRegisterSale = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        const quantitySold = parseInt(quantityInput, 10);
        const skuToSell = skuInput.trim().toUpperCase();

        if (!skuToSell || isNaN(quantitySold) || quantitySold <= 0) {
            showMessage("Por favor, introduce un SKU y una cantidad válida.", "error");
            setIsLoading(false);
            return;
        }

        const foundProduct = products.find(p => p.sku.toUpperCase() === skuToSell);
        const foundKit = kits.find(k => k.sku.toUpperCase() === skuToSell);
        
        let itemsForSale = [];

        if (foundKit) {
            itemsForSale = foundKit.components.map(c => {
                const productInfo = products.find(p => p.id === c.product_id);
                return {
                    sku: c.sku,
                    name: productInfo?.name || c.sku,
                    quantity: c.quantity * quantitySold,
                    product_id: c.product_id,
                    price: productInfo?.sale_price || 0
                };
            });
        } else if (foundProduct) {
            itemsForSale.push({
                sku: foundProduct.sku,
                name: foundProduct.name,
                quantity: quantitySold,
                product_id: foundProduct.id,
                price: foundProduct.sale_price || 0
            });
        } else {
             itemsForSale.push({
                sku: skuToSell,
                name: 'Producto no registrado',
                quantity: quantitySold,
                product_id: null,
                price: 0
            });
        }

        const { data, error } = await supabase.rpc('process_sale', {
            p_user_id: session.user.id,
            p_sale_type: saleType,
            p_channel: 'manual',
            p_items: itemsForSale
        });

        if (error || (data && !data.success)) {
            showMessage(`Error al registrar la venta: ${error?.message || data.message}`, 'error');
        } else {
            showMessage("Venta registrada con éxito.", "success");
            await Promise.all([
                fetchProducts(),
                fetchSalesOrders(),
                fetchSupplierOrders(),
            ]);
            setSkuInput('');
            setQuantityInput('1');
            skuSaleInputRef.current?.focus();
        }

        setIsLoading(false);
    };

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-8 max-w-xl mx-auto">
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