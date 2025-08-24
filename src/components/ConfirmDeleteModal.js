import React from 'react';

const ConfirmDeleteModal = ({ item, onConfirm, onCancel, itemType = 'producto' }) => {
    if (!item) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                <div className="text-center">
                    <svg aria-hidden="true" className="mx-auto mb-4 w-14 h-14 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <h3 className="mb-5 text-lg font-normal text-gray-400">
                        ¿Estás seguro de que deseas eliminar este {itemType}?
                    </h3>
                    <p className="mb-5 font-bold text-white">{item.sku} - {item.name}</p>
                    <button
                        onClick={onConfirm}
                        className="text-white bg-red-600 hover:bg-red-800 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm inline-flex items-center px-5 py-2.5 text-center mr-2"
                    >
                        Sí, estoy seguro
                    </button>
                    <button
                        onClick={onCancel}
                        className="focus:ring-4 focus:outline-none rounded-lg border text-sm font-medium px-5 py-2.5 focus:z-10 bg-gray-700 text-gray-300 border-gray-500 hover:text-white hover:bg-gray-600 focus:ring-gray-600"
                    >
                        No, cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDeleteModal;