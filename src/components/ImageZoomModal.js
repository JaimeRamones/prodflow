// src/components/ImageZoomModal.js
import React from 'react';

const ImageZoomModal = ({ imageUrl, onClose }) => {
    if (!imageUrl) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-80 z-50 flex justify-center items-center p-4"
            onClick={onClose} // Cierra el modal al hacer clic en el fondo
        >
            <img 
                src={imageUrl} 
                alt="Vista ampliada" 
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()} // Evita que el clic en la imagen cierre el modal
            />
        </div>
    );
};

export default ImageZoomModal;