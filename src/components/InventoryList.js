import React, { useState, useContext, useMemo } from 'react';
import { AppContext } from '../App';

// --- CAMBIO 1: Añadimos el prop `onPublish` ---
const InventoryList = ({ onEdit, onDelete, onPublish }) => {
    const { products } = useContext(AppContext);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const productsPerPage = 15;

    const filteredProducts = useMemo(() => {
        return products.filter(product =>
            (product.sku?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (product.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (product.brand?.toLowerCase() || '').includes(searchTerm.toLowerCase())
        );
    }, [products, searchTerm]);

    const indexOfLastProduct = currentPage * productsPerPage;
    const indexOfFirstProduct = indexOfLastProduct - productsPerPage;
    const currentProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);
    const totalPages = Math.ceil(filteredProducts.length / productsPerPage);

    const handlePaginate = (pageNumber) => {
        if (pageNumber < 1 || pageNumber > totalPages) return;
        setCurrentPage(pageNumber);
    };
    
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-white">Inventario</h2>
                <div className="relative w-full sm:w-auto">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar por SKU, Nombre, Marca..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="block w-full p-2.5 pl-10 text-sm border rounded-lg bg-gray-700 border-gray-600 placeholder-gray-400 text-white focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>

            <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3">SKU</th>
                            <th scope="col" className="px-6 py-3">Nombre</th>
                            <th scope="col" className="px-6 py-3 text-right">Costo</th>
                            <th scope="col" className="px-6 py-3 text-right">Venta</th>
                            <th scope="col" className="px-6 py-3 text-center">Disp.</th>
                            <th scope="col" className="px-6 py-3 text-center">Res.</th>
                            <th scope="col" className="px-6 py-3 text-center">Total</th>
                            <th scope="col" className="px-6 py-3 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentProducts.map(product => (
                            <tr key={product.id} className="bg-gray-800 border-b border-gray-700 hover:bg-gray-600">
                                <th scope="row" className="px-6 py-4 font-medium text-white whitespace-nowrap">{product.sku}</th>
                                <td className="px-6 py-4">{product.name}</td>
                                <td className="px-6 py-4 text-right">{formatCurrency(product.cost_price)}</td>
                                <td className="px-6 py-4 text-right font-semibold text-white">{formatCurrency(product.sale_price)}</td>
                                <td className="px-6 py-4 text-center text-green-400 font-bold">{product.stock_disponible || 0}</td>
                                <td className="px-6 py-4 text-center text-yellow-400">{product.stock_reservado || 0}</td>
                                <td className="px-6 py-4 text-center">{product.stock_total || 0}</td>
                                <td className="px-6 py-4">
                                    <div className="flex justify-center items-center gap-3">
                                        {/* --- CAMBIO 2: Añadimos el nuevo botón de Publicar --- */}
                                        <button onClick={() => onPublish(product)} title="Publicar en Mercado Libre" className="p-1.5 text-yellow-400 hover:text-white hover:bg-yellow-500 rounded-md transition-colors">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                        </button>
                                        <button onClick={() => onEdit(product)} title="Editar Producto" className="p-1.5 text-blue-400 hover:text-white hover:bg-blue-500 rounded-md transition-colors">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path></svg>
                                        </button>
                                        <button onClick={() => onDelete(product)} title="Eliminar Producto" className="p-1.5 text-red-400 hover:text-white hover:bg-red-500 rounded-md transition-colors">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <nav className="flex items-center justify-between pt-4" aria-label="Table navigation">
                <span className="text-sm font-normal text-gray-400">
                    Mostrando <span className="font-semibold text-white">{indexOfFirstProduct + 1}-{Math.min(indexOfLastProduct, filteredProducts.length)}</span> de <span className="font-semibold text-white">{filteredProducts.length}</span>
                </span>
                <ul className="inline-flex items-center -space-x-px">
                    <li>
                        <button onClick={() => handlePaginate(currentPage - 1)} disabled={currentPage === 1} className="block px-3 py-2 ml-0 leading-tight border rounded-l-lg bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="sr-only">Anterior</span>
                            <svg className="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                        </button>
                    </li>
                    <li>
                        <span className="px-3 py-2 leading-tight border bg-gray-700 border-gray-700 text-gray-300">Página {currentPage} de {totalPages}</span>
                    </li>
                    <li>
                        <button onClick={() => handlePaginate(currentPage + 1)} disabled={currentPage === totalPages} className="block px-3 py-2 leading-tight border rounded-r-lg bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                            <span className="sr-only">Siguiente</span>
                            <svg className="w-5 h-5" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path></svg>
                        </button>
                    </li>
                </ul>
            </nav>
        </div>
    );
};

export default InventoryList;