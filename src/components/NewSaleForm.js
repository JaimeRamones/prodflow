// ... importaciones ...

const NewSaleForm = () => {
    console.log("--- NewSaleForm: Me estoy renderizando ---"); // <-- AÑADE ESTA LÍNEA
    const { products, session, showMessage, kits, fetchProducts, fetchSalesOrders, fetchSupplierOrders } = useContext(AppContext);
    // ... el resto de tu código ...

// Ruta: src/components/NewSaleForm.js

import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const NewSaleForm = () => {
    const { products, session, showMessage, kits, fetchProducts, fetchSalesOrders, fetchSupplierOrders } = useContext(AppContext);
    
    // ... (toda la primera parte del componente con los estados y la lógica de sugerencias se mantiene igual)
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
        // ... (lógica de checkStock se mantiene igual)
    }, [skuInput, products, kits]);

    const handleSkuInputChange = useCallback((e) => {
        // ... (lógica de sugerencias se mantiene igual)
    }, [products, kits]);

    const handleSelectSuggestion = useCallback((item) => {
        // ... (lógica de seleccionar sugerencia se mantiene igual)
    }, []);

    const handleKeyDownOnSkuInput = useCallback((e) => {
        // ... (lógica de teclado se mantiene igual)
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
        
        // --- LÓGICA MEJORADA ---
        if (foundProduct) {
            // --- FLUJO NORMAL: El producto existe ---
            
            // 1. Crear la orden de venta
            const totalAmount = (foundProduct.sale_price || 0) * quantitySold;
            const { data: newOrder, error: orderError } = await supabase
                .from('sales_orders').insert({
                    user_id: session.user.id, status: 'Pendiente', shipping_type: saleType,
                    total_amount: totalAmount, buyer_name: 'Venta Manual',
                }).select().single();

            if (orderError) {
                showMessage(`Error al crear la orden: ${orderError.message}`, 'error');
                setIsLoading(false);
                return;
            }

            // 2. Crear el item de la orden
            const { error: itemError } = await supabase.from('order_items').insert({
                order_id: newOrder.id, sku: foundProduct.sku, title: foundProduct.name,
                quantity: quantitySold, unit_price: foundProduct.sale_price,
                thumbnail_url: foundProduct.image_url, product_id: foundProduct.id,
                name: foundProduct.name, sale_price: foundProduct.sale_price,
            });

            if (itemError) {
                showMessage(`Error al guardar los artículos: ${itemError.message}`, 'error');
                setIsLoading(false);
                return;
            }

            // 3. Actualizar el stock
            const newStock = (foundProduct.stock_disponible || 0) - quantitySold;
            await supabase.from('products').update({ stock_disponible: newStock }).eq('id', foundProduct.id);
            
            showMessage("Venta registrada y stock actualizado.", "success");

        } else {
            // --- NUEVO FLUJO: El producto NO existe en el inventario ---
            
            // 1. Crear la orden de venta con datos genéricos
            const { data: newOrder, error: orderError } = await supabase
                .from('sales_orders').insert({
                    user_id: session.user.id, status: 'Pendiente Proveedor', // Un estado especial
                    shipping_type: saleType, total_amount: 0, // No sabemos el precio
                    buyer_name: 'Venta Manual (Sin Stock)',
                }).select().single();

            if (orderError) {
                showMessage(`Error al crear la orden para producto sin stock: ${orderError.message}`, 'error');
                setIsLoading(false);
                return;
            }

            // 2. Crear el item de la orden
            await supabase.from('order_items').insert({
                order_id: newOrder.id, sku: skuToSell, title: `Producto no registrado: ${skuToSell}`,
                quantity: quantitySold, unit_price: 0,
            });

            // 3. Crear el pedido a proveedor
            await supabase.from('supplier_orders').insert({
                user_id: session.user.id,
                sku: skuToSell,
                quantity: quantitySold,
                status: 'Pendiente',
                sale_type: saleType,
                related_sale_id: newOrder.id, // Vinculamos el pedido a la venta
            });

            showMessage(`Venta registrada para SKU no existente. Se creó un pedido a proveedor.`, "success");
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
            <form onSubmit={handleRegisterSale}>
                {/* ... inputs ... */}
                <button type="submit" disabled={isLoading} className="w-full ...">
                    {isLoading ? 'Registrando...' : 'Registrar Venta'}
                </button>
            </form>
        </div>
    );
};

export default NewSaleForm;