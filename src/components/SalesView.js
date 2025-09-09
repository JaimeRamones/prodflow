// Ruta: src/components/SalesView.js
// VERSIÓN FINAL: Genera un ZIP con el archivo TXT para ZPL, igual que Mercado Libre.

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';
import ImageZoomModal from './ImageZoomModal';
import JSZip from 'jszip'; // Importamos la librería para crear Zips

// (El resto de los componentes y funciones iniciales no cambian...)
const FlexIcon = () => ( <div className="flex items-center gap-1 bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"></path></svg><span className="text-xs font-bold">FLEX</span></div> );
const ShippingIcon = () => ( <div className="flex items-center gap-1 bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"></path><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v5a1 1 0 001 1h2.05a2.5 2.5 0 014.9 0H21a1 1 0 001-1V8a1 1 0 00-1-1h-7z"></path></svg><span className="text-xs font-bold">ENVÍOS</span></div> );

const SalesView = () => {
    const { products, showMessage, salesOrders, fetchSalesOrders, fetchSupplierOrders } = useContext(AppContext);
    const [isLoading, setIsLoading] = useState(true); const [isSyncing, setIsSyncing] = useState(false); const [isProcessing, setIsProcessing] = useState(null); const [isPrinting, setIsPrinting] = useState(false); const [page, setPage] = useState(0); const [searchTerm, setSearchTerm] = useState(''); const [selectedOrders, setSelectedOrders] = useState(new Set()); const [filters, setFilters] = useState({ shippingType: 'all', status: 'all' }); const [zoomedImageUrl, setZoomedImageUrl] = useState(null); const ITEMS_PER_PAGE = 50;
    const processedOrders = useMemo(() => { if (!salesOrders) return []; const enriched = salesOrders.map(order => ({ ...order, order_items: order.order_items.map(item => { const productInfo = products.find(p => p.sku === item.sku); const costWithVat = productInfo?.cost_price ? (productInfo.cost_price * 1.21).toFixed(2) : 'N/A'; const secureThumbnail = item.thumbnail_url ? item.thumbnail_url.replace(/^http:/, 'https:') : null; const images = productInfo?.image_urls || [secureThumbnail, 'https://via.placeholder.com/150']; return { ...item, cost_with_vat: costWithVat, images: images }; }) })); let filtered = enriched; if (filters.shippingType !== 'all') { filtered = filtered.filter(order => order.shipping_type === filters.shippingType); } if (filters.status !== 'all') { if (filters.status === 'daily_dispatch') { const today = new Date().toISOString().split('T')[0]; filtered = filtered.filter(order => order.created_at.startsWith(today)); } else { filtered = filtered.filter(order => order.status === filters.status); } } if (searchTerm.trim()) { const term = searchTerm.trim().toLowerCase(); filtered = filtered.filter(order => order.meli_order_id?.toString().includes(term) || order.buyer_name?.toLowerCase().includes(term) || order.shipping_id?.toString().includes(term) || order.order_items.some(item => item.sku?.toLowerCase().includes(term) || item.title?.toLowerCase().includes(term))); } return filtered; }, [salesOrders, products, searchTerm, filters]);
    const paginatedOrders = useMemo(() => { const from = page * ITEMS_PER_PAGE; const to = from + ITEMS_PER_PAGE; return processedOrders.slice(from, to); }, [processedOrders, page]);
    const totalPages = Math.ceil(processedOrders.length / ITEMS_PER_PAGE);
    useEffect(() => { if(salesOrders) setIsLoading(false); }, [salesOrders]); useEffect(() => { setPage(0); setSelectedOrders(new Set()); }, [searchTerm, filters]); useEffect(() => { setSelectedOrders(new Set()); }, [page]);
    const handleSelectOrder = (orderId) => { const newSelection = new Set(selectedOrders); newSelection.has(orderId) ? newSelection.delete(orderId) : newSelection.add(orderId); setSelectedOrders(newSelection); }; const handleSelectAll = (e) => { if (e.target.checked) { setSelectedOrders(new Set(paginatedOrders.map(o => o.id))); } else { setSelectedOrders(new Set()); } }; const handleSyncSales = async () => { setIsSyncing(true); try { const { data, error } = await supabase.functions.invoke('mercadolibre-sync-orders'); if (error) throw error; showMessage(data.message || 'Ventas sincronizadas.', 'success'); await fetchSalesOrders(); } catch (err) { showMessage(`Error al sincronizar ventas: ${err.message}`, 'error'); } finally { setIsSyncing(false); } }; const handleProcessOrder = async (orderId) => { setIsProcessing(orderId); try { const { data, error } = await supabase.functions.invoke('process-mercado-libre-order', { body: { order_id: orderId } }); if (error) throw error; showMessage(data.message, 'success'); await Promise.all([fetchSalesOrders(), fetchSupplierOrders()]); } catch (err) { showMessage(`Error al procesar la orden: ${err.message}`, 'error'); } finally { setIsProcessing(null); } };
    const formatDate = (dateString) => { if (!dateString) return 'N/A'; const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }; return new Date(dateString).toLocaleString('es-AR', options); }; const getStatusChip = (status) => { const statuses = { 'Recibido': { text: 'Recibido', color: 'bg-cyan-500/20 text-cyan-300' }, 'Pendiente': { text: 'Pendiente', color: 'bg-yellow-500/20 text-yellow-300' }, 'En Preparación': { text: 'En Preparación', color: 'bg-blue-500/20 text-blue-300' }, 'Preparado': { text: 'Preparado', color: 'bg-indigo-500/20 text-indigo-300' }, 'Despachado': { text: 'Despachado', color: 'bg-green-500/20 text-green-300' }, }; const { text, color } = statuses[status] || { text: status, color: 'bg-gray-700 text-gray-300' }; return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${color}`}>{text}</span>; };

    const handlePrintLabels = async (format) => {
        if (selectedOrders.size === 0) { showMessage("Por favor, selecciona al menos una venta.", "info"); return; }
        setIsPrinting(true);
        try {
            const shipmentIds = Array.from(selectedOrders).map(id => salesOrders.find(o => o.id === id)?.shipping_id).filter(Boolean);
            if (shipmentIds.length === 0) throw new Error("No se encontraron IDs de envío.");

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error("No se pudo obtener la sesión del usuario.");
            
            const functionUrl = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/get-ml-labels`;
            
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ shipment_ids: shipmentIds.join(','), format: format })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error del servidor: ${response.statusText}`);
            }

            const blob = await response.blob();
            if (blob.size === 0) throw new Error("El archivo recibido está vacío.");

            // --- LÓGICA MEJORADA PARA ZPL Y ZIP ---
            if (format === 'zpl') {
                const zip = new JSZip();
                // Añadimos el contenido ZPL (que está en el blob) a un archivo .txt dentro del zip
                zip.file("Etiqueta de envio.txt", blob); 
                const zipBlob = await zip.generateAsync({ type: "blob" });
                
                const url = window.URL.createObjectURL(zipBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Etiqueta MercadoEnvios-${Date.now()}.zip`;
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                // La lógica para PDF sigue igual
                const fileName = `etiquetas-${Date.now()}.pdf`;
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            }
            
        } catch (err) {
            showMessage(`Error al generar etiquetas: ${err.message}`, 'error');
        } finally {
            setIsPrinting(false);
        }
    };
    
    // (El resto del JSX no cambia)
    return (
        <div>
             <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4"><h2 className="text-3xl font-bold text-white">Gestión de Ventas</h2><button onClick={handleSyncSales} disabled={isSyncing} className="flex-shrink-0 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 disabled:bg-gray-600">{isSyncing ? 'Sincronizando...' : 'Sincronizar Ventas'}</button></div>
            <div className="bg-gray-800 border border-gray-700 p-4 rounded-lg mb-6 space-y-4"><input type="text" placeholder="Buscar por Nº de Venta, SKU, Comprador o Nº de Envío..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400" /><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><select value={filters.shippingType} onChange={e => setFilters({...filters, shippingType: e.target.value})} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"><option value="all">Todos los Envíos</option><option value="flex">Flex</option><option value="mercado_envios">Mercado Envíos</option></select><select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"><option value="all">Todos los Estados</option><option value="Recibido">Recibido</option><option value="Pendiente">Pendiente</option><option value="En Preparación">En Preparación</option><option value="daily_dispatch">Envíos del Día</option><option value="cancelled">Canceladas</option></select></div></div>
            <div className="flex items-center gap-4 mb-4"><div className="flex items-center"><input type="checkbox" onChange={handleSelectAll} checked={paginatedOrders.length > 0 && selectedOrders.size === paginatedOrders.length} className="w-5 h-5 bg-gray-700 border border-gray-600 rounded" /><label className="ml-2 text-sm text-gray-400">Seleccionar todos en esta página ({selectedOrders.size} seleccionados)</label></div><button onClick={() => handlePrintLabels('pdf')} disabled={selectedOrders.size === 0 || isPrinting} className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50">{isPrinting ? 'Imprimiendo...' : 'Imprimir PDF'}</button><button onClick={() => handlePrintLabels('zpl')} disabled={selectedOrders.size === 0 || isPrinting} className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:opacity-50">{isPrinting ? 'Imprimiendo...' : 'Imprimir ZPL'}</button></div>
            <div className="space-y-4">
                {isLoading ? ( <p className="text-center p-8 text-gray-400">Cargando...</p> ) : ( paginatedOrders.length > 0 ? paginatedOrders.map(order => (
                    <div key={order.id} className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                        <div className="p-4 bg-gray-900/50 flex flex-col sm:flex-row justify-between items-start gap-2 border-b border-gray-700">
                            <div className="flex items-center gap-4"><input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => handleSelectOrder(order.id)} className="w-5 h-5 flex-shrink-0 bg-gray-700 border-gray-600 rounded" /><div><p className="text-sm font-semibold text-blue-400">Venta #{order.meli_order_id}</p><p className="text-lg font-bold text-white">{order.buyer_name || 'Comprador Desconocido'}</p><p className="text-xs text-gray-400">{formatDate(order.created_at)}</p></div></div>
                            <div className="text-right flex-shrink-0"><p className="text-2xl font-bold text-white">${new Intl.NumberFormat('es-AR').format(order.total_amount || 0)}</p><div className="flex items-center justify-end gap-2 mt-1">{order.shipping_type === 'flex' ? <FlexIcon /> : <ShippingIcon />}</div></div>
                        </div>
                        <div className="p-4 space-y-3">
                            {order.order_items.map((item, index) => (
                                <div key={item.meli_item_id || index} className="flex items-start gap-4 p-2 rounded-md hover:bg-gray-700/50">
                                    <div className="flex-shrink-0 flex gap-2">{item.images && item.images[0] && <img src={item.images[0]} alt={item.title} className="w-16 h-16 object-cover rounded-md border border-gray-600 cursor-pointer" onClick={() => setZoomedImageUrl(item.images[0])}/>}{item.images && item.images[1] && <img src={item.images[1]} alt={item.title} className="hidden md:block w-16 h-16 object-cover rounded-md border border-gray-600 cursor-pointer" onClick={() => setZoomedImageUrl(item.images[1])}/>}</div>
                                    <div className="flex-grow"><p className="font-semibold text-white leading-tight">{item.title}</p><p className="text-sm text-gray-400 font-mono bg-gray-700 inline-block px-2 py-0.5 rounded mt-1">SKU: {item.sku || 'N/A'}</p></div>
                                    <div className="text-right flex-shrink-0 w-48"><p className="text-white font-semibold">{item.quantity} x ${new Intl.NumberFormat('es-AR').format(item.unit_price || 0)}</p><p className="text-xs text-yellow-400 mt-1">Costo c/IVA: ${item.cost_with_vat}</p></div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 bg-gray-800 border-t border-gray-700 flex justify-between items-center"><div>{getStatusChip(order.status)}</div>{order.status === 'Recibido' && (<button onClick={() => handleProcessOrder(order.id)} disabled={isProcessing === order.id} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600">{isProcessing === order.id ? 'Procesando...' : 'Procesar Pedido'}</button>)}</div>
                    </div>
                )) : ( <div className="text-center py-12 px-6 bg-gray-800 border border-gray-700 rounded-lg"><h3 className="mt-2 text-lg font-medium text-white">No se encontraron ventas</h3><p className="mt-1 text-sm text-gray-400">Prueba a sincronizar o ajusta tu búsqueda y filtros.</p></div>))}
            </div>
            <div className="flex justify-between items-center p-4 mt-4 bg-gray-800 rounded-lg border border-gray-700"><button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-4 py-2 bg-gray-600 text-white rounded-lg disabled:opacity-50">Anterior</button><span className="text-gray-400">Página {page + 1} de {totalPages > 0 ? totalPages : 1}</span><button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-4 py-2 bg-gray-600 text-white rounded-lg disabled:opacity-50">Siguiente</button></div>
            <ImageZoomModal imageUrl={zoomedImageUrl} onClose={() => setZoomedImageUrl(null)} />
        </div>
    );
};

export default SalesView;

