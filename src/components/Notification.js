import React, { useEffect } from 'react';

// Componente para mostrar notificaciones "toast" no intrusivas.
const Notification = ({ message, type, onClose }) => {
    // Desaparece automáticamente después de 3 segundos
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 3000);

        return () => clearTimeout(timer);
    }, [onClose]);

    const baseClasses = "fixed top-5 right-5 z-50 p-4 rounded-lg shadow-lg flex items-center";
    const typeClasses = {
        success: "bg-green-800/90 border border-green-600 text-green-200",
        error: "bg-red-800/90 border border-red-600 text-red-200",
    };

    const icon = {
        success: <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>,
        error: <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>,
    }

    return (
        <div className={`${baseClasses} ${typeClasses[type] || 'bg-gray-700 text-white'}`}>
            {icon[type]}
            <span>{message}</span>
            <button onClick={onClose} className="ml-4 text-xl font-bold">&times;</button>
        </div>
    );
};

export default Notification;
