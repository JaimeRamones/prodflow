// Ruta: src/components/InFlow.js

import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react'; // ✅ Agregado useMemo
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import EditPublicationModal from './EditPublicationModal';
import { SyncLoader } from 'react-spinners';
import Papa from 'papaparse';
import { FiUpload, FiDownload, FiPlus, FiRefreshCw, FiSearch } from "react-icons/fi";

// --- Componentes de UI Internos para un look profesional ---
const StatusPill = ({ status }) => {
    const styles = { active: 'bg-green-500/20 text-green-300 border border-green-500/30', paused: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30', closed: 'bg-gray-500/20 text-gray-400 border border-gray-500/30' };
    const text = { active: 'Activa', paused: 'Pausada', closed: 'Finalizada' };
    return <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${styles[status] || styles.closed}`}>{text[status] || status}</span>;
};

const ToggleSwitch = ({ checked, onChange }) => (
    <label className="relative inline-flex items-center cursor-pointer" title={checked ? "Sincronización Activada" : "Sincronización Desactivada"}>
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only peer" />
        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
    </label>
);

const InFlow = () => {
    const { showMessage } = useContext(AppContext);
    const [publications, setPublications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [editingPublication, setEditingPublication] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPublications, setSelectedPublications] = useState(new Set());

    const fetchPublications = useCallback(async () => {
        setIsLoading(true);
        // Asegúrate que tu tabla en Supabase se llame 'publications'
        const { data, error } = await supabase.from('mercadolibre_listings').select('*').order('created_at', { ascending: false });
        if (error) {
            showMessage('Error al cargar publicaciones', 'error');
        } else {
            setPublications(data);
        }
        setIsLoading(false);
    }, [showMessage]);

    useEffect(() => {
        fetchPublications();
    }, [fetchPublications]);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) handleImport(file);
        event.target.value = null; // Resetear el input
    };

    const handleImport = (file) => {
        setIsImporting(true);
        showMessage('Procesando archivo CSV...', 'info');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const { data, error } = await supabase.functions.invoke('mercadolibre-inflow', {
                        body: { publications: results.data },
                    });

                    if (error) throw error;
                    if (data.error) throw new Error(data.error);

                    showMessage(`Importación completada: ${data.summary}`, 'success');
                    await fetchPublications();
                } catch (err) {
                    showMessage(`Error en la importación: ${err.message}`, 'error');
                } finally {
                    setIsImporting(false);
                }
            },
            error: (err) => {
                showMessage(`Error al leer el archivo: ${err.message}`, 'error');
                setIsImporting(false);
            }
        });
    };
    
    // --- Lógica para las demás funciones (placeholders) ---
    const handleExport = () => showMessage('Funcionalidad de exportar no implementada.', 'info');
    const handleCreateNew = () => showMessage('Funcionalidad de crear no implementada.', 'info');
    const handleSavePublication = async (updatedData) => { /* Tu lógica de guardado individual */ };
    const handleSelect = (pubId, isSelected) => { /* Tu lógica de selección */ };
    const handleBulkAction = (action) => showMessage('Funcionalidad masiva no implementada.', 'info');

    // Filtramos las publicaciones según el término de búsqueda
    const filteredPublications = useMemo(() => 
        publications.filter(pub => 
            pub.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (pub.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name || '').toLowerCase().includes(searchTerm.toLowerCase())
        ), 
    [publications, searchTerm]);

    return (
        <div className="bg-gray-900 text-white min-h-screen p-4 sm:p-6 lg:p-8">
            <div className="container mx-auto">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold">InFlow</h1>
                        <p className="text-gray-400">{filteredPublications.length} Publicaciones Mostradas</p>
                    </div>
                    <div className="flex items-center space-x-2 mt-4 sm:mt-0">
                        <button onClick={fetchPublications} className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600"><FiRefreshCw /> Sincronizar</button>
                        <input type="file" id="csv-importer" className="hidden" accept=".csv" onChange={handleFileChange} disabled={isImporting} />
                        <label htmlFor="csv-importer" className={`flex items-center gap-2 px-4 py-2 rounded-md cursor-pointer transition-colors ${isImporting ? 'bg-gray-500' : 'bg-green-600 hover:bg-green-700'}`}><FiUpload /> {isImporting ? 'Importando...' : 'Importar'}</label>
                        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-md hover:bg-gray-600"><FiDownload /> Exportar</button>
                        <button onClick={handleCreateNew} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700"><FiPlus /> Crear</button>
                    </div>
                </div>

                <div className="mb-6 p-4 bg-gray-800 rounded-lg flex gap-4">
                     <div className="relative flex-grow">
                        <FiSearch className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Buscar por Título o SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500" />
                    </div>
                </div>
                
                {/* Tabla de Publicaciones */}
                <div className="overflow-x-auto bg-gray-800 rounded-lg shadow">
                    {isLoading ? <div className="h-64 flex justify-center items-center"><SyncLoader color={"#3B82F6"} /></div> : 
                    <table className="min-w-full">
                         <thead className="border-b border-gray-700">
                                <tr>
                                    <th className="p-4 w-4"><input type="checkbox" className="bg-gray-700 border-gray-600" /></th>
                                    <th className="p-4 text-left text-sm font-semibold text-gray-400">Publicación</th>
                                    <th className="p-4 text-left text-sm font-semibold text-gray-400">SKU</th>
                                    <th className="p-4 text-left text-sm font-semibold text-gray-400">Precio</th>
                                    <th className="p-4 text-left text-sm font-semibold text-gray-400">Stock</th>
                                    <th className="p-4 text-left text-sm font-semibold text-gray-400">Estado</th>
                                    <th className="p-4 text-left text-sm font-semibold text-gray-400">Acciones</th>
                                </tr>
                            </thead>
                        <tbody>
                            {filteredPublications.map((pub) => (
                                <tr key={pub.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                                    <td className="p-4"><input type="checkbox" className="bg-gray-700 border-gray-600"/></td>
                                    <td className="p-4 flex items-center gap-4">
                                        <img src={pub.pictures?.[0]?.url || 'https://via.placeholder.com/150'} alt={pub.title} className="w-12 h-12 rounded-md object-cover" />
                                        <div>
                                            <p className="font-semibold max-w-xs truncate">{pub.title}</p>
                                            <p className="text-xs text-gray-400 font-mono">{pub.id}</p>
                                        </div>
                                    </td>
                                    <td className="p-4 text-sm font-mono">{pub.attributes?.find(a => a.id === 'SELLER_SKU')?.value_name || 'N/A'}</td>
                                    <td className="p-4 text-sm">${pub.price.toLocaleString('es-AR')}</td>
                                    <td className="p-4 text-sm font-bold">{pub.available_quantity}</td>
                                    <td className="p-4"><StatusPill status={pub.status} /></td>
                                    <td className="p-4">
                                        <button onClick={() => setEditingPublication(pub)} className="text-blue-400 hover:text-blue-300">Editar</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    }
                </div>
                 {editingPublication && <EditPublicationModal publication={editingPublication} onClose={() => setEditingPublication(null)} onSave={handleSavePublication} isSaving={isSaving} />}
            </div>
        </div>
    );
};

export default InFlow;