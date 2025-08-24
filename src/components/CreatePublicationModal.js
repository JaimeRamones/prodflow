import React, { useState, useEffect, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { AppContext } from '../App';

const CreatePublicationModal = ({ product, onClose }) => {
    // --- CAMBIO CLAVE: Todos los hooks se declaran aquí arriba, antes de cualquier condición ---
    const { showMessage } = useContext(AppContext);
    const [predictions, setPredictions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [isValidated, setIsValidated] = useState(false);

    // Los estados del formulario ahora dependen del 'product' que llega, de forma segura
    const [title, setTitle] = useState(product?.name || '');
    const [price, setPrice] = useState(product?.sale_price || '');
    const [selectedCategoryId, setSelectedCategoryId] = useState('');

    const resetValidation = () => setIsValidated(false);

    useEffect(() => {
        // Si no hay título, no hacemos nada
        if (!title) {
            setIsLoading(false);
            setPredictions([]);
            return;
        };

        const predictCategory = async () => {
            setIsLoading(true);
            setError(null);
            resetValidation();
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) throw new Error("User not authenticated");

                const { data, error } = await supabase.functions.invoke('mercadolibre-predict-category', {
                    headers: { 'Authorization': `Bearer ${session.access_token}` },
                    body: { title: title }
                });
                
                if (error) throw error;
                if (data.error) throw new Error(data.error);
                setPredictions(data);
            } catch (err) {
                setError('No se pudieron sugerir categorías. Intenta con otro título.');
                console.error(err);
            }
            setIsLoading(false);
        };

        const timer = setTimeout(() => { predictCategory(); }, 500);
        return () => clearTimeout(timer);
    }, [title]);

    // --- CAMBIO CLAVE: La condición de salida ahora está DESPUÉS de los hooks ---
    if (!product) return null;

    const getListingData = () => {
        const selectedPrediction = predictions.find(p => p.category_id === selectedCategoryId);
        let attributesToSend = selectedPrediction ? selectedPrediction.attributes : [];

        const brandIndex = attributesToSend.findIndex(attr => attr.id === 'BRAND');
        if (brandIndex > -1) {
            attributesToSend[brandIndex].value_name = product.brand;
        } else {
            attributesToSend.push({ "id": "BRAND", "value_name": product.brand });
        }
        
        if (!attributesToSend.some(attr => attr.id === 'MPN')) {
            attributesToSend.push({ "id": "MPN", "value_name": product.sku });
        }
        
        return {
            title: title,
            category_id: selectedCategoryId,
            price: parseFloat(price),
            currency_id: "ARS",
            available_quantity: product.stock_disponible,
            buying_mode: "buy_it_now",
            condition: "new",
            listing_type_id: "gold_special",
            pictures: [],
            attributes: attributesToSend,
        };
    };

    const handleValidate = async () => {
        setIsProcessing(true);
        const listingData = getListingData();
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("User not authenticated");
            
            const { data, error } = await supabase.functions.invoke('mercadolibre-validate-listing', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
                body: listingData
            });

            if (error) throw error;

            if (data.success) {
                showMessage('¡Validación exitosa! Ya puedes publicar el producto.', 'success');
                setIsValidated(true);
            } else {
                throw new Error(data.error || 'Error desconocido.');
            }
        } catch(err) {
            showMessage(err.message.replace('Error de validación de Mercado Libre: ', ''), 'error');
        }
        setIsProcessing(false);
    };

    const handlePublish = async () => {
        setIsProcessing(true);
        const listingData = getListingData();
         try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("User not authenticated");
            
            const { data, error } = await supabase.functions.invoke('mercadolibre-publish-listing', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
                body: listingData
            });

            if (error) throw error;

            if (data.success) {
                showMessage(`¡Producto publicado! ID: ${data.newListing.id}`, 'success');
                onClose();
            } else {
                throw new Error(data.error || 'Error desconocido al publicar.');
            }
        } catch(err) {
            showMessage(err.message.replace('Error de Mercado Libre: ', ''), 'error');
        }
        setIsProcessing(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg text-white border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">Publicar en Mercado Libre</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">Título de la Publicación</label>
                        <input type="text" id="title" value={title} onChange={(e) => {setTitle(e.target.value); resetValidation();}} className="w-full p-2 rounded-md bg-gray-700 border border-gray-600 text-white"/>
                    </div>
                     <div>
                        <label htmlFor="price" className="block text-sm font-medium text-gray-300 mb-1">Precio</label>
                        <input type="number" id="price" value={price} onChange={(e) => {setPrice(e.target.value); resetValidation();}} className="w-full p-2 rounded-md bg-gray-700 border border-gray-600 text-white"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Categoría (Sugerencias)</label>
                        {isLoading ? ( <p className="text-gray-400">Buscando sugerencias...</p> ) 
                        : error ? ( <p className="text-red-400">{error}</p> ) 
                        : (
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                                {predictions.length > 0 ? predictions.map(pred => (
                                    <label key={pred.category_id} className={`flex items-center p-3 rounded-md border-2 cursor-pointer ${selectedCategoryId === pred.category_id ? 'bg-blue-900/50 border-blue-500' : 'bg-gray-700 border-gray-600'}`}>
                                        <input type="radio" name="category" value={pred.category_id} checked={selectedCategoryId === pred.category_id} onChange={(e) => {setSelectedCategoryId(e.target.value); resetValidation();}} className="h-4 w-4 text-blue-600 bg-gray-700 border-gray-500"/>
                                        <span className="ml-3 text-sm text-white">{pred.category_name}</span>
                                    </label>
                                )) : <p className="text-gray-500 text-sm">No se encontraron sugerencias para este título.</p>}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-6 flex justify-end space-x-4">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500">
                        Cancelar
                    </button>
                    <button onClick={handleValidate} disabled={!selectedCategoryId || isProcessing || isValidated} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed">
                        {isProcessing ? 'Validando...' : (isValidated ? '✓ Validado' : 'Validar')}
                    </button>
                    <button onClick={handlePublish} disabled={!isValidated || isProcessing} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:text-gray-400 disabled:cursor-not-allowed">
                        {isProcessing ? 'Publicando...' : 'Publicar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreatePublicationModal;