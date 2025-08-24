import React, { useState } from 'react';

// Componente reutilizable para gestionar los códigos equivalentes
const EquivalentCodesInput = ({ codes, setCodes }) => {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newCode = inputValue.trim().toUpperCase();
            if (newCode && !codes.includes(newCode)) {
                setCodes([...codes, newCode]);
            }
            setInputValue(''); // Limpiar el input
        }
    };

    const removeCode = (codeToRemove) => {
        setCodes(codes.filter(code => code !== codeToRemove));
    };

    return (
        <div>
            <label className="block mb-2 text-sm font-medium text-gray-300">Códigos Equivalentes (OEM, etc.)</label>
            <div className="bg-gray-700 border border-gray-600 rounded-lg p-2 flex flex-wrap gap-2">
                {codes.map(code => (
                    <span key={code} className="bg-gray-900/80 text-sky-300 text-sm font-medium px-2.5 py-1 rounded-full flex items-center gap-2">
                        {code}
                        <button type="button" onClick={() => removeCode(code)} className="text-red-400 hover:text-red-600">
                           &#x2715;
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-grow bg-transparent text-white outline-none p-1"
                    placeholder="Añadir código y presionar Enter..."
                />
            </div>
        </div>
    );
};

export default EquivalentCodesInput;
