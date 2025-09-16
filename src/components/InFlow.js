// Ruta: src/components/InFlow.js

import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import EditPublicationModal from './EditPublicationModal';
import { SyncLoader } from 'react-spinners';
import * as XLSX from 'xlsx';
import { FiUpload, FiDownload, FiPlus, FiRefreshCw, FiSearch, FiChevronLeft, FiChevronRight } from "react-icons/fi";

// --- Componentes de UI Internos para un look profesional ---
const StatusPill = ({ status }) => {
    const styles = { 
        active: 'bg-green-500/20 text-green-300 border border-green-500/30', 
        paused: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30', 
        closed: 'bg-gray-500/20 text-gray-400 border border-gray-500/30' 
    };
    const text = { active: 'Activa', paused: 'Pausada', closed: 'Finalizada' };
    return <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${styles[status] || styles.closed}`}>{text[status] || status}</span>;
};

const ToggleSwitch = ({ checked, onChange }) => (
    <label className="relative inline-flex items-center cursor-pointer" title={checked ? "Sincronización Activada" : "Sincronización Desactivada"}>
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
    </label>
);

// Componente de Paginación
const Pagination = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }) => {
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    const getVisiblePages = () => {
        const delta = 2;
        const range = [];
        const rangeWithDots = [];

        for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
            range.push(i);
        }

        if (currentPage - delta > 2) {
            rangeWithDots.push(1, '...');
        } else {
            rangeWithDots.push(1);
        }

        rangeWithDots.push(...range);

        if (currentPage + delta < totalPages - 1) {
            rangeWithDots.push('...', totalPages);
        } else {
            rangeWithDots.push(totalPages);
        }

        return rangeWithDots;
    };

    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-t border-gray-700">
            <div className="flex items-center text-sm text-gray-400">
                <span>Mostrando {startItem} - {endItem} de {totalItems} publicaciones</span>
            </div>
            
            <div className="flex items-center space-x-1">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <FiChevronLeft className="w-4 h-4" />
                </button>

                {getVisiblePages().map((page, index) => (
                    <button
                        key={index}
                        onClick={() => typeof page === 'number' && onPageChange(page)}
                        disabled={typeof page !== 'number'}
                        className={`px-3 py-2 text-sm rounded-md ${
                            page === currentPage
                                ? 'bg-blue-600 text-white'
                                : typeof page === 'number'
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                : 'text-gray-500 cursor-default'
                        }`}
                    >
                        {page}
                    </button>
                ))}

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <FiChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

const InFlow = () => {
    const { showMessage } = useContext(AppContext);
    const [publications, setPublications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [editingPublication, setEditingPublication] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPublications, setSelectedPublications] = useState(new Set());
    
    // Estados para paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPublications, setTotalPublications] = useState(0);
    const itemsPerPage = 100;

    const fetchPublications = useCallback(async (page = 1, search = '') => {
        setIsLoading(true);
        try {
            // Calcular offset para paginación
            const offset = (page - 1) * itemsPerPage;
            
            // Construir query con filtros
            let query = supabase
                .from('mercadolibre_listings')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(offset, offset + itemsPerPage - 1);

            // Agregar filtro de búsqueda si existe
            if (search.trim()) {
                query = query.or(`title.ilike.%${search}%,sku.ilike.%${search}%`);
            }

            const { data, error, count } = await query;
            
            if (error) {
                showMessage('Error al cargar publicaciones', 'error');
                console.error('Error:', error);
            } else {
                setPublications(data || []);
                setTotalPublications(count || 0);
            }
        } catch (err) {
            console.error('Error en fetchPublications:', err);
            showMessage('Error inesperado al cargar publicaciones', 'error');
        }
        setIsLoading(false);
    }, [showMessage, itemsPerPage]);

    useEffect(() => {
        fetchPublications(currentPage, searchTerm);
    }, [fetchPublications, currentPage, searchTerm]);

    const handlePageChange = useCallback((newPage) => {
        setCurrentPage(newPage);
    }, []);

    const handleSearchChange = useCallback((e) => {
        const newSearchTerm = e.target.value;
        setSearchTerm(newSearchTerm);
        setCurrentPage(1); // Reset a primera página al buscar
    }, []);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) handleImport(file);
        event.target.value = null; // Resetear el input
    };

    const handleImport = async (file) => {
        setIsImporting(true);
        showMessage('Procesando archivo Excel...', 'info');

        try {
            // Leer archivo Excel
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { 
                type: 'array',
                cellStyles: true,
                cellFormulas: true,
                cellDates: true
            });

            // Obtener todas las hojas (cada hoja representa una categoría en Integraly)
            const allData = [];
            workbook.SheetNames.forEach(sheetName => {
                if (sheetName !== 'Ayuda' && sheetName !== 'Instrucciones') { // Excluir hojas de ayuda
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                        header: 1,
                        defval: '',
                        blankrows: false
                    });

                    if (jsonData.length > 1) { // Asegurar que hay datos además del header
                        const headers = jsonData[0];
                        const rows = jsonData.slice(1);
                        
                        rows.forEach(row => {
                            const publication = {};
                            headers.forEach((header, index) => {
                                if (header && row[index] !== undefined) {
                                    publication[header] = row[index];
                                }
                            });
                            
                            if (publication['Título'] || publication['Title'] || publication['title']) {
                                publication._categoria = sheetName; // Agregar categoría desde el nombre de la hoja
                                allData.push(publication);
                            }
                        });
                    }
                }
            });

            if (allData.length === 0) {
                throw new Error('No se encontraron publicaciones válidas en el archivo Excel');
            }

            // Enviar datos a la edge function
            const { data, error } = await supabase.functions.invoke('mercadolibre-inflow', {
                body: { publications: allData },
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            showMessage(`Importación completada: ${data.summary}`, 'success');
            
            // Refrescar datos después de la importación
            await fetchPublications(currentPage, searchTerm);
            
        } catch (err) {
            console.error('Error en importación:', err);
            showMessage(`Error en la importación: ${err.message}`, 'error');
        } finally {
            setIsImporting(false);
        }
    };
    
    // --- Lógica para las demás funciones ---
    const handleExport = async () => {
        try {
            showMessage('Preparando exportación...', 'info');
            
            // Obtener todas las publicaciones (sin paginación para export)
            const { data, error } = await supabase
                .from('mercadolibre_listings')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Crear workbook de Excel
            const workbook = XLSX.utils.book_new();
            
            // Agrupar por categoría si existe ese campo
            const groupedByCategory = data.reduce((acc, pub) => {
                const category = pub.category_name || pub.categoria || 'Sin Categoría';
                if (!acc[category]) acc[category] = [];
                acc[category].push(pub);
                return acc;
            }, {});

            // Crear una hoja por categoría
            Object.entries(groupedByCategory).forEach(([category, publications]) => {
                const worksheet = XLSX.utils.json_to_sheet(publications);
                XLSX.utils.book_append_sheet(workbook, worksheet, category.substring(0, 31)); // Excel limita nombres de hojas a 31 caracteres
            });

            // Generar archivo y descargar
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `publicaciones_${new Date().toISOString().split('T')[0]}.xlsx`;
            link.click();
            window.URL.revokeObjectURL(url);

            showMessage('Exportación completada exitosamente', 'success');
        } catch (err) {
            console.error('Error en exportación:', err);
            showMessage(`Error en la exportación: ${err.message}`, 'error');
        }
    };

    const handleCreateNew = () => showMessage('Funcionalidad de crear no implementada.', 'info');
    const handleSavePublication = async (updatedData) => { /* Tu lógica de guardado individual */ };
    const handleSelect = (pubId, isSelected) => { /* Tu lógica de selección */ };
    const handleBulkAction = (action) => showMessage('Funcionalidad masiva no implementada.', 'info');

    // Calcular totales para paginación
    const totalPages = Math.ceil(totalPublications / itemsPerPage);

    return (
        <div className="bg-gray-900 text-white min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="container mx-auto max-w-7xl">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold">InFlow</h1>
                        <p className="text-gray-400">
                            {totalPublications.toLocaleString()} Publicaciones Total | 
                            Página {currentPage} de {totalPages}
                        </p>
                    </div>
                    <div className="flex items-center space-x-2 mt-4 sm:mt-0 flex-wrap gap-2">
                        <button 
                            onClick={() => fetchPublications(currentPage, searchTerm)} 
                            className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600 transition-colors"
                        >
                            <FiRefreshCw className={isLoading ? 'animate-spin' : ''} /> 
                            Sincronizar
                        </button>
                        
                        <input 
                            type="file" 
                            id="excel-importer" 
                            className="hidden" 
                            accept=".xlsx,.xls" 
                            onChange={handleFileChange} 
                            disabled={isImporting} 
                        />
                        <label 
                            htmlFor="excel-importer" 
                            className={`flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer transition-colors ${
                                isImporting ? 'bg-gray-500' : 'bg-green-600 hover:bg-green-700'
                            }`}
                        >
                            <FiUpload /> 
                            {isImporting ? 'Importando Excel...' : 'Importar Excel'}
                        </label>
                        
                        <button 
                            onClick={handleExport} 
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                        >
                            <FiDownload /> Exportar Excel
                        </button>
                        
                        <button 
                            onClick={handleCreateNew} 
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 rounded-md hover:bg-purple-700 transition-colors"
                        >
                            <FiPlus /> Crear
                        </button>
                    </div>
                </div>

                {/* Barra de búsqueda */}
                <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                    <div className="relative">
                        <FiSearch className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar por Título o SKU..." 
                            value={searchTerm} 
                            onChange={handleSearchChange}
                            className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                        />
                    </div>
                </div>
                
                {/* Tabla de Publicaciones */}
                <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    {isLoading ? (
                        <div className="h-64 flex justify-center items-center">
                            <div className="text-center">
                                <SyncLoader color={"#3B82F6"} />
                                <p className="mt-4 text-gray-400">Cargando publicaciones...</p>
                            </div>
                        </div>
                    ) : publications.length === 0 ? (
                        <div className="h-64 flex justify-center items-center">
                            <div className="text-center">
                                <p className="text-gray-400 text-lg">No se encontraron publicaciones</p>
                                <p className="text-gray-500 text-sm mt-2">
                                    {searchTerm ? 'Intenta con otro término de búsqueda' : 'Importa un archivo Excel para comenzar'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead className="border-b border-gray-700">
                                        <tr>
                                            <th className="p-4 w-4">
                                                <input type="checkbox" className="bg-gray-700 border-gray-600 rounded" />
                                            </th>
                                            <th className="p-4 text-left text-sm font-semibold text-gray-400">Publicación</th>
                                            <th className="p-4 text-left text-sm font-semibold text-gray-400">SKU</th>
                                            <th className="p-4 text-left text-sm font-semibold text-gray-400">Precio</th>
                                            <th className="p-4 text-left text-sm font-semibold text-gray-400">Stock</th>
                                            <th className="p-4 text-left text-sm font-semibold text-gray-400">Estado</th>
                                            <th className="p-4 text-left text-sm font-semibold text-gray-400">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {publications.map((pub) => (
                                            <tr key={pub.id} className="border-b border-gray-700 hover:bg-gray-700/50 transition-colors">
                                                <td className="p-4">
                                                    <input type="checkbox" className="bg-gray-700 border-gray-600 rounded"/>
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-4">
                                                        <img 
                                                            src={pub.pictures?.[0]?.url || pub.thumbnail || 'https://via.placeholder.com/150'} 
                                                            alt={pub.title} 
                                                            className="w-12 h-12 rounded-md object-cover bg-gray-600" 
                                                            onError={(e) => {
                                                                e.target.src = 'https://via.placeholder.com/150';
                                                            }}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-semibold text-sm max-w-xs truncate text-white">
                                                                {pub.title}
                                                            </p>
                                                            <p className="text-xs text-gray-400 font-mono">
                                                                {pub.id || pub.meli_id}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-sm font-mono text-gray-300">
                                                    {pub.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name || 
                                                     pub.sku || 
                                                     pub.seller_sku || 
                                                     'N/A'}
                                                </td>
                                                <td className="p-4 text-sm text-gray-300">
                                                    ${(pub.price || 0).toLocaleString('es-AR')}
                                                </td>
                                                <td className="p-4 text-sm font-bold text-gray-300">
                                                    {pub.available_quantity || pub.stock || 0}
                                                </td>
                                                <td className="p-4">
                                                    <StatusPill status={pub.status || 'active'} />
                                                </td>
                                                <td className="p-4">
                                                    <button 
                                                        onClick={() => setEditingPublication(pub)} 
                                                        className="text-blue-400 hover:text-blue-300 transition-colors"
                                                    >
                                                        Editar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            {/* Paginación */}
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={handlePageChange}
                                totalItems={totalPublications}
                                itemsPerPage={itemsPerPage}
                            />
                        </>
                    )}
                </div>

                {/* Modal de edición */}
                {editingPublication && (
                    <EditPublicationModal 
                        publication={editingPublication} 
                        onClose={() => setEditingPublication(null)} 
                        onSave={handleSavePublication} 
                        isSaving={isSaving} 
                    />
                )}
            </div>
        </div>
    );
};

export default InFlow;