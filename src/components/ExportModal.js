// Ruta: src/components/ExportModal.js

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';
import { FiX, FiDownload, FiFilter, FiSearch, FiSettings } from 'react-icons/fi';

const ExportModal = ({ isOpen, onClose }) => {
    const { showMessage } = useContext(AppContext);
    const [isExporting, setIsExporting] = useState(false);
    const [activeTab, setActiveTab] = useState('selection');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchBy, setSearchBy] = useState('title');
    const [totalItems, setTotalItems] = useState(0);
    
    // Estados para filtros
    const [filters, setFilters] = useState({
        status: ['active', 'paused', 'closed'],
        dateFrom: '',
        dateTo: '',
        priceMin: '',
        priceMax: '',
        stockMin: '',
        stockMax: '',
        hasImages: 'all',
        hasDescription: 'all',
        categories: [],
        sellers: []
    });

    // Estados para selección de campos
    const [selectedFields, setSelectedFields] = useState({
        // Campos básicos
        id: true,
        vendedor: false,
        tienda_oficial: false,
        categoria: true,
        titulo: true,
        descripcion: false,
        precio: true,
        descuento: false,
        descuento_nivel_3_6: false,
        descuento_nivel_1_2: false,
        descuento_fecha_desde: false,
        descuento_fecha_hasta: false,
        moneda: true,
        comision: false,
        sku: true,
        seller_custom_field: false,
        estado: true,
        stock: true,
        disponibilidad_stock: false,
        tipo_publicacion: false,
        condicion: false,
        
        // Campos de envío
        envio_gratis: false,
        precio_envio_gratis: false,
        modo_envio: false,
        metodo_envio: false,
        retira_persona: false,
        envio_flex: false,
        
        // Campos informativos
        garantia: false,
        fecha_creacion: true,
        ultima_actualizacion: false,
        resultado: false,
        resultado_observaciones: false,
        
        // Imágenes
        imagen_1: true,
        imagen_2: false,
        imagen_3: false,
        imagen_4: false,
        imagen_5: false,
        imagen_6: false,
        imagen_7: false,
        imagen_8: false,
        imagen_9: false,
        imagen_10: false,
        video: false,
        
        // Campos de canal y marketing
        canal_publicacion: false,
        visitas: false,
        vendidos: true,
        tags: false,
        ahora_12: false,
        url_publicacion: false,
        calidad_publicacion: false,
        calidad_imagen: false,
        mejoras_pendientes: false,
        campana: false,
        publicidad: false,
        
        // Campos técnicos
        estado_ficha_tecnica: false,
        item_catalogo: false,
        dominio: false,
        estado_participar_catalogo: false,
        participar_catalogo: false,
        catalogo_estado: false,
        catalogo_precio: false,
        catalogo_sku: false,
        
        // Ubicación
        ubicacion: false,
        domicilio: false,
        
        // Variaciones
        variacion_color: false,
        variacion_codigo_universal: false,
        
        // Atributos
        atributo_marca: true,
        atributo_linea: false,
        atributo_modelo: false,
        
        // Impuestos
        iva: true,
        impuesto_interno: false
    });

    // Obtener estadísticas para mostrar en el panel
    useEffect(() => {
        if (isOpen) {
            fetchStats();
        }
    }, [isOpen, filters, searchTerm]);

    const fetchStats = async () => {
        try {
            const { count } = await supabase
                .from('mercadolibre_listings')
                .select('*', { count: 'exact', head: true })
                .in('status', filters.status);
            
            setTotalItems(count || 0);
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const fieldLabels = {
        id: 'Id',
        vendedor: 'Vendedor',
        tienda_oficial: 'Tienda Oficial',
        categoria: 'Categoría',
        titulo: 'Título',
        descripcion: 'Descripción',
        precio: 'Precio',
        descuento: 'Descuento',
        descuento_nivel_3_6: 'Descuento Nivel 3 al 6',
        descuento_nivel_1_2: 'Descuento Nivel 1 y 2',
        descuento_fecha_desde: 'Descuento Fecha Desde',
        descuento_fecha_hasta: 'Descuento Fecha Hasta',
        moneda: 'Moneda',
        comision: 'Comisión',
        sku: 'SKU',
        seller_custom_field: 'seller_custom_field',
        estado: 'Estado',
        stock: 'Stock',
        disponibilidad_stock: 'Disponibilidad de stock',
        tipo_publicacion: 'Tipo de Publicación',
        condicion: 'Condición',
        envio_gratis: 'Envío Gratis',
        precio_envio_gratis: 'Precio Envío Gratis',
        modo_envio: 'Modo Envío',
        metodo_envio: 'Método Envío',
        retira_persona: 'Retira en Persona',
        envio_flex: 'Envío FLEX',
        garantia: 'Garantía',
        fecha_creacion: 'Fecha Creación',
        ultima_actualizacion: 'Última Actualización',
        resultado: 'Resultado',
        resultado_observaciones: 'Resultado Observaciones',
        imagen_1: 'Imagen 1',
        imagen_2: 'Imagen 2',
        imagen_3: 'Imagen 3',
        imagen_4: 'Imagen 4',
        imagen_5: 'Imagen 5',
        imagen_6: 'Imagen 6',
        imagen_7: 'Imagen 7',
        imagen_8: 'Imagen 8',
        imagen_9: 'Imagen 9',
        imagen_10: 'Imagen 10',
        video: 'Video',
        canal_publicacion: 'Canal de Publicación',
        visitas: 'Visitas',
        vendidos: 'Vendidos',
        tags: 'Tags',
        ahora_12: 'Ahora 12',
        url_publicacion: 'URL Publicación',
        calidad_publicacion: 'Calidad de la Publicación',
        calidad_imagen: 'Calidad de la Imagen',
        mejoras_pendientes: 'Mejoras pendientes',
        campana: 'Campaña',
        publicidad: 'Publicidad',
        estado_ficha_tecnica: 'Estado Ficha Técnica',
        item_catalogo: 'Item de Catálogo',
        dominio: 'Dominio',
        estado_participar_catalogo: 'Estado Para Participar en Catálogo',
        participar_catalogo: 'Participar en Catálogo',
        catalogo_estado: 'Catálogo Estado',
        catalogo_precio: 'Catálogo Precio',
        catalogo_sku: 'Catálogo SKU',
        ubicacion: 'Ubicación',
        domicilio: 'Domicilio',
        variacion_color: 'Variación Color',
        variacion_codigo_universal: 'Variación Código universal',
        atributo_marca: 'Atributo Marca',
        atributo_linea: 'Atributo Línea',
        atributo_modelo: 'Atributo Modelo',
        iva: 'IVA',
        impuesto_interno: 'Impuesto Interno'
    };

    const handleFieldToggle = (fieldName) => {
        setSelectedFields(prev => ({
            ...prev,
            [fieldName]: !prev[fieldName]
        }));
    };

    const selectAllFields = () => {
        const allSelected = {};
        Object.keys(selectedFields).forEach(key => {
            allSelected[key] = true;
        });
        setSelectedFields(allSelected);
    };

    const selectNoneFields = () => {
        const noneSelected = {};
        Object.keys(selectedFields).forEach(key => {
            noneSelected[key] = false;
        });
        setSelectedFields(noneSelected);
    };

    const selectEssentialFields = () => {
        const essential = {
            ...Object.keys(selectedFields).reduce((acc, key) => ({ ...acc, [key]: false }), {}),
            id: true,
            categoria: true,
            titulo: true,
            precio: true,
            stock: true,
            estado: true,
            sku: true,
            imagen_1: true,
            atributo_marca: true,
            iva: true
        };
        setSelectedFields(essential);
    };

    const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({
            ...prev,
            [filterName]: value
        }));
    };

    const handleStatusToggle = (status) => {
        setFilters(prev => ({
            ...prev,
            status: prev.status.includes(status) 
                ? prev.status.filter(s => s !== status)
                : [...prev.status, status]
        }));
    };

    const handleExport = async () => {
        try {
            setIsExporting(true);
            showMessage('Preparando exportación personalizada...', 'info');

            // Construir query con filtros
            let query = supabase.from('mercadolibre_listings').select('*');

            // Aplicar filtros de estado
            if (filters.status.length > 0) {
                query = query.in('status', filters.status);
            }

            // Aplicar filtros de fecha
            if (filters.dateFrom) {
                query = query.gte('created_at', filters.dateFrom);
            }
            if (filters.dateTo) {
                query = query.lte('created_at', filters.dateTo);
            }

            // Aplicar filtros de precio
            if (filters.priceMin) {
                query = query.gte('price', parseFloat(filters.priceMin));
            }
            if (filters.priceMax) {
                query = query.lte('price', parseFloat(filters.priceMax));
            }

            // Aplicar filtros de stock
            if (filters.stockMin) {
                query = query.gte('available_quantity', parseInt(filters.stockMin));
            }
            if (filters.stockMax) {
                query = query.lte('available_quantity', parseInt(filters.stockMax));
            }

            // Aplicar búsqueda
            if (searchTerm.trim()) {
                switch (searchBy) {
                    case 'title':
                        query = query.ilike('title', `%${searchTerm}%`);
                        break;
                    case 'id':
                        query = query.eq('meli_id', searchTerm);
                        break;
                    case 'sku':
                        query = query.ilike('sku', `%${searchTerm}%`);
                        break;
                }
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;

            // Transformar datos según campos seleccionados
            const exportData = data.map(pub => {
                const row = {};
                
                // Solo incluir campos seleccionados
                Object.entries(selectedFields).forEach(([fieldKey, isSelected]) => {
                    if (isSelected) {
                        const label = fieldLabels[fieldKey];
                        
                        switch (fieldKey) {
                            case 'id':
                                row[label] = pub.meli_id || pub.id;
                                break;
                            case 'titulo':
                                row[label] = pub.title || '';
                                break;
                            case 'precio':
                                row[label] = pub.price || 0;
                                break;
                            case 'stock':
                                row[label] = pub.available_quantity || 0;
                                break;
                            case 'estado':
                                row[label] = pub.status === 'active' ? 'Activa' : 
                                           pub.status === 'paused' ? 'Pausada' : 'Finalizada';
                                break;
                            case 'categoria':
                                row[label] = pub.category_id || '';
                                break;
                            case 'sku':
                                // Extraer SKU de atributos si existe
                                try {
                                    const attrs = typeof pub.attributes === 'string' ? 
                                        JSON.parse(pub.attributes) : pub.attributes;
                                    const skuAttr = attrs?.find?.(a => a.id === 'SELLER_SKU');
                                    row[label] = skuAttr?.value_name || pub.sku || '';
                                } catch {
                                    row[label] = pub.sku || '';
                                }
                                break;
                            case 'atributo_marca':
                                try {
                                    const attrs = typeof pub.attributes === 'string' ? 
                                        JSON.parse(pub.attributes) : pub.attributes;
                                    const brandAttr = attrs?.find?.(a => a.id === 'BRAND');
                                    row[label] = brandAttr?.value_name || '';
                                } catch {
                                    row[label] = '';
                                }
                                break;
                            case 'imagen_1':
                                try {
                                    const pics = typeof pub.pictures === 'string' ? 
                                        JSON.parse(pub.pictures) : pub.pictures;
                                    row[label] = pics?.[0]?.url || pics?.[0] || pub.thumbnail_url || '';
                                } catch {
                                    row[label] = pub.thumbnail_url || '';
                                }
                                break;
                            case 'vendidos':
                                row[label] = pub.sold_quantity || 0;
                                break;
                            case 'fecha_creacion':
                                row[label] = pub.created_at || '';
                                break;
                            case 'moneda':
                                row[label] = 'ARS';
                                break;
                            case 'iva':
                                row[label] = '21%';
                                break;
                            default:
                                row[label] = ''; // Valores por defecto para otros campos
                        }
                    }
                });

                return row;
            });

            // Crear Excel con formato profesional
            const workbook = XLSX.utils.book_new();

            // Crear hoja de datos
            const worksheet = XLSX.utils.json_to_sheet(exportData);

            // Aplicar formato profesional
            if (exportData.length > 0) {
                const range = XLSX.utils.decode_range(worksheet['!ref']);
                
                // Filtros automáticos
                worksheet['!autofilter'] = { ref: worksheet['!ref'] };
                
                // Formatear cabeceras
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const headerCell = XLSX.utils.encode_cell({ r: 0, c: C });
                    if (worksheet[headerCell]) {
                        worksheet[headerCell].s = {
                            font: { bold: true, color: { rgb: "FFFFFF" } },
                            fill: { fgColor: { rgb: "4472C4" } },
                            alignment: { horizontal: "center" },
                            border: {
                                top: { style: "thin", color: { rgb: "000000" } },
                                bottom: { style: "thin", color: { rgb: "000000" } },
                                left: { style: "thin", color: { rgb: "000000" } },
                                right: { style: "thin", color: { rgb: "000000" } }
                            }
                        };
                    }
                }

                // Formatear filas de datos
                for (let R = 1; R <= range.e.r; ++R) {
                    for (let C = range.s.c; C <= range.e.c; ++C) {
                        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                        if (worksheet[cellRef]) {
                            worksheet[cellRef].s = {
                                fill: { fgColor: { rgb: R % 2 === 0 ? "F8F9FA" : "FFFFFF" } },
                                border: {
                                    top: { style: "thin", color: { rgb: "E0E0E0" } },
                                    bottom: { style: "thin", color: { rgb: "E0E0E0" } },
                                    left: { style: "thin", color: { rgb: "E0E0E0" } },
                                    right: { style: "thin", color: { rgb: "E0E0E0" } }
                                }
                            };
                        }
                    }
                }

                // Ajustar anchos de columna
                const colWidths = Object.keys(exportData[0]).map(header => ({
                    wch: Math.max(header.length + 2, 15)
                }));
                worksheet['!cols'] = colWidths;

                // Congelar primera fila
                worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
            }

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Publicaciones');

            // Generar y descargar
            const excelBuffer = XLSX.write(workbook, { 
                bookType: 'xlsx', 
                type: 'array',
                cellStyles: true 
            });
            
            const blob = new Blob([excelBuffer], { 
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
            });
            
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `prodflow_export_${new Date().toISOString().split('T')[0]}.xlsx`;
            link.click();
            window.URL.revokeObjectURL(url);

            showMessage(`Exportación completada: ${exportData.length} publicaciones exportadas`, 'success');
            onClose();

        } catch (error) {
            console.error('Error en exportación:', error);
            showMessage(`Error en la exportación: ${error.message}`, 'error');
        } finally {
            setIsExporting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <FiDownload className="w-6 h-6" />
                        <h2 className="text-xl font-semibold">Obtener Publicaciones InFlow</h2>
                    </div>
                    <button onClick={onClose} className="text-white hover:text-gray-200">
                        <FiX className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                    {/* Tabs */}
                    <div className="flex border-b border-gray-200 mb-6">
                        <button
                            onClick={() => setActiveTab('selection')}
                            className={`px-4 py-2 font-medium ${activeTab === 'selection' 
                                ? 'border-b-2 border-blue-600 text-blue-600' 
                                : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Selección de campos
                        </button>
                        <button
                            onClick={() => setActiveTab('filters')}
                            className={`px-4 py-2 font-medium ${activeTab === 'filters' 
                                ? 'border-b-2 border-blue-600 text-blue-600' 
                                : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Filtros
                        </button>
                    </div>

                    {activeTab === 'selection' && (
                        <div>
                            <div className="flex items-center gap-4 mb-6">
                                <h3 className="text-lg font-semibold">Selección de campos</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={selectEssentialFields}
                                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                    >
                                        Esenciales
                                    </button>
                                    <button
                                        onClick={selectAllFields}
                                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={selectNoneFields}
                                        className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                                    >
                                        Ninguno
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-6">
                                {/* Campos básicos */}
                                <div>
                                    <h4 className="font-semibold text-blue-600 mb-3">Campos Básicos</h4>
                                    <div className="space-y-2">
                                        {['id', 'categoria', 'titulo', 'descripcion', 'precio', 'moneda', 'sku', 'estado', 'stock'].map(field => (
                                            <label key={field} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFields[field]}
                                                    onChange={() => handleFieldToggle(field)}
                                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-700 select-none">{fieldLabels[field]}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Campos de marketing */}
                                <div>
                                    <h4 className="font-semibold text-green-600 mb-3">Marketing y Ventas</h4>
                                    <div className="space-y-2">
                                        {['vendidos', 'visitas', 'campana', 'publicidad', 'descuento', 'ahora_12', 'tags'].map(field => (
                                            <label key={field} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFields[field]}
                                                    onChange={() => handleFieldToggle(field)}
                                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-700 select-none">{fieldLabels[field]}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Campos técnicos */}
                                <div>
                                    <h4 className="font-semibold text-purple-600 mb-3">Técnicos y Atributos</h4>
                                    <div className="space-y-2">
                                        {['atributo_marca', 'atributo_modelo', 'iva', 'impuesto_interno', 'estado_ficha_tecnica', 'calidad_publicacion'].map(field => (
                                            <label key={field} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFields[field]}
                                                    onChange={() => handleFieldToggle(field)}
                                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-700 select-none">{fieldLabels[field]}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Imágenes */}
                            <div className="mt-6">
                                <h4 className="font-semibold text-orange-600 mb-3">Imágenes</h4>
                                <div className="grid grid-cols-5 gap-4">
                                    {['imagen_1', 'imagen_2', 'imagen_3', 'imagen_4', 'imagen_5', 'imagen_6', 'imagen_7', 'imagen_8', 'imagen_9', 'imagen_10'].map(field => (
                                        <label key={field} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedFields[field]}
                                                onChange={() => handleFieldToggle(field)}
                                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700 select-none">{fieldLabels[field]}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'filters' && (
                        <div className="space-y-6">
                            {/* Búsqueda */}
                            <div>
                                <h4 className="font-semibold mb-3">Buscar por:</h4>
                                <div className="flex gap-4">
                                    <select
                                        value={searchBy}
                                        onChange={(e) => setSearchBy(e.target.value)}
                                        className="border border-gray-300 rounded px-3 py-2"
                                    >
                                        <option value="title">Título</option>
                                        <option value="id">ID</option>
                                        <option value="sku">SKU</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Término de búsqueda..."
                                        className="flex-1 border border-gray-300 rounded px-3 py-2"
                                    />
                                </div>
                            </div>

                            {/* Estado */}
                            <div>
                                <h4 className="font-semibold mb-3">Estado:</h4>
                                <div className="flex gap-4">
                                    {[
                                        { key: 'active', label: 'Activas', color: 'bg-green-100 text-green-800' },
                                        { key: 'paused', label: 'Pausadas', color: 'bg-yellow-100 text-yellow-800' },
                                        { key: 'closed', label: 'Finalizadas', color: 'bg-gray-100 text-gray-800' }
                                    ].map(status => (
                                        <label key={status.key} className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={filters.status.includes(status.key)}
                                                onChange={() => handleStatusToggle(status.key)}
                                                className="w-4 h-4 text-blue-600"
                                            />
                                            <span className={`px-2 py-1 rounded text-sm ${status.color}`}>
                                                {status.label}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Filtros de rango */}
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <h4 className="font-semibold mb-3">Rango de Precios:</h4>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            placeholder="Mínimo"
                                            value={filters.priceMin}
                                            onChange={(e) => handleFilterChange('priceMin', e.target.value)}
                                            className="flex-1 border border-gray-300 rounded px-3 py-2"
                                        />
                                        <span className="self-center">-</span>
                                        <input
                                            type="number"
                                            placeholder="Máximo"
                                            value={filters.priceMax}
                                            onChange={(e) => handleFilterChange('priceMax', e.target.value)}
                                            className="flex-1 border border-gray-300 rounded px-3 py-2"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <h4 className="font-semibold mb-3">Rango de Stock:</h4>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            placeholder="Mínimo"
                                            value={filters.stockMin}
                                            onChange={(e) => handleFilterChange('stockMin', e.target.value)}
                                            className="flex-1 border border-gray-300 rounded px-3 py-2"
                                        />
                                        <span className="self-center">-</span>
                                        <input
                                            type="number"
                                            placeholder="Máximo"
                                            value={filters.stockMax}
                                            onChange={(e) => handleFilterChange('stockMax', e.target.value)}
                                            className="flex-1 border border-gray-300 rounded px-3 py-2"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Filtros de fecha */}
                            <div>
                                <h4 className="font-semibold mb-3">Rango de Fechas:</h4>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm text-gray-600 mb-1">Desde:</label>
                                        <input
                                            type="date"
                                            value={filters.dateFrom}
                                            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                                            className="w-full border border-gray-300 rounded px-3 py-2"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-sm text-gray-600 mb-1">Hasta:</label>
                                        <input
                                            type="date"
                                            value={filters.dateTo}
                                            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                                            className="w-full border border-gray-300 rounded px-3 py-2"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 p-4 flex items-center justify-between bg-gray-50">
                    <div className="text-sm text-gray-600">
                        Total de publicaciones a exportar: <span className="font-semibold text-blue-600">{totalItems.toLocaleString()}</span>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isExporting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Exportando...
                                </>
                            ) : (
                                <>
                                    <FiDownload className="w-4 h-4" />
                                    Aceptar
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportModal;