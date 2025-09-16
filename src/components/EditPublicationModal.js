// Reemplaza TODO el contenido de tu archivo: EditPublicationModal.js

import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // Asegúrate que la ruta sea correcta

const EditPublicationModal = ({ publication, onClose, onUpdate }) => {
  // Estados para cada campo editable
  const [title, setTitle] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [description, setDescription] = useState('');
  const [attributes, setAttributes] = useState('');
  const [pictures, setPictures] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (publication) {
      setTitle(publication.title || '');
      // Extraer SKU de los atributos
      const sellerSku = publication.attributes?.find(attr => attr.id === 'SELLER_SKU')?.value_name;
      const customSku = publication.seller_custom_field;
      setSku(sellerSku || customSku || '');
      
      setPrice(publication.price || '');
      setStock(publication.available_quantity || '');
      
      // La descripción se obtiene de un endpoint separado, por lo que la inicializamos vacía
      // para poder enviarla. El usuario deberá escribir la nueva descripción completa.
      setDescription('');

      // Convertimos arrays a un string JSON legible para editar en un textarea
      setAttributes(JSON.stringify(publication.attributes || [], null, 2));
      setPictures(JSON.stringify(publication.pictures || [], null, 2));
    }
  }, [publication]);

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    let parsedAttributes, parsedPictures;
    try {
      // Validar que los campos de texto de JSON sean válidos antes de enviar
      parsedAttributes = JSON.parse(attributes);
      parsedPictures = JSON.parse(pictures);
    } catch (jsonError) {
      setError(`Error en el formato JSON: ${jsonError.message}`);
      setIsLoading(false);
      return;
    }

    try {
      const payload = {
        meliId: publication.id,
        accessToken: publication.access_token, // Asumiendo que el token está en el objeto
        title: title,
        description: description,
        sku: sku,
        attributes: parsedAttributes,
        pictures: parsedPictures,
        price: parseFloat(price),
        stock: parseInt(stock, 10),
      };

      const { data, error: functionError } = await supabase.functions.invoke('mercadolibre-update-single-item', {
        body: { record: payload },
      });

      if (functionError) throw functionError;
      if (data.error) throw new Error(data.error);

      setSuccess('¡Publicación actualizada con éxito!');
      onUpdate(); // Refrescar la lista de publicaciones
      setTimeout(() => {
        onClose(); // Cerrar el modal después de 2 segundos
      }, 2000);

    } catch (err) {
      console.error("Error al guardar:", err);
      setError(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!publication) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full flex items-center justify-center z-50">
      <div className="relative mx-auto p-5 border w-full max-w-3xl shadow-lg rounded-md bg-white">
        <h3 className="text-xl leading-6 font-medium text-gray-900 mb-4">Editar Publicación: {publication.id}</h3>
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}
        {success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">{success}</div>}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Columna Izquierda */}
          <div>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">Título</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
            </div>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">SKU</label>
              <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
            </div>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">Precio</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
            </div>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">Stock</label>
              <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" />
            </div>
             <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">Descripción (Plain Text)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows="5" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" placeholder="Ingresa la nueva descripción completa aquí..."></textarea>
            </div>
          </div>

          {/* Columna Derecha */}
          <div>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">Atributos (JSON)</label>
              <textarea value={attributes} onChange={(e) => setAttributes(e.target.value)} rows="10" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline font-mono text-xs"></textarea>
            </div>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">Imágenes (JSON)</label>
              <textarea value={pictures} onChange={(e) => setPictures(e.target.value)} rows="8" className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline font-mono text-xs"></textarea>
            </div>
          </div>
        </div>
        
        <div className="items-center px-4 py-3 mt-4 sm:px-6 sm:flex sm:flex-row-reverse">
          <button onClick={handleSave} disabled={isLoading} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">
            {isLoading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
          <button onClick={onClose} type="button" className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPublicationModal;