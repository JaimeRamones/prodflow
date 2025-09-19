// Ruta: src/components/ProductDetailModal.js
// Modal detallado con toda la información del producto

import React, { useState, useEffect, useContext } from 'react';
import { AppContext } from '../App';
import { supabase } from '../supabaseClient';

const ProductDetailModal = ({ product, onClose, onEdit, onSyncPrice }) => {
    const { suppliers, showMessage } = useContext(AppContext);
    const [productDetails, setProductDetails] = useState(null);
    const [salesData, setSalesData] = useState([]);
    const [references, setReferences] = useState([]);
    const [equivalents, setEquivalents] = useState([]);
    const [supplierStock, setSupplierStock] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('general');

    useEffect(() => {
        if (product?.id) {
            loadProductDetails();
        }
    }, [product]);

    const loadProductDetails = async () => {
        setIsLoading(true);
        try {
            // Cargar referencias OEM y cruzadas
            const { data: refs, error: refsError } = await supabase
                .from('product_references')
                .select('*')
                .eq('product_id', product.id);

            if (!refsError && refs) {
                setReferences(refs);
            }

            // Cargar equivalencias
            const { data: equivalents, error: equivError } = await supabase
                .from('product_equivalents')
                .select(`
                    *,
                    equivalent_product:products!equivalent_product_id(
                        id, sku, name, brand, stock_disponible, stock_total, 
                        cost_price, sale_price, supplier_id
                    )
                `)
                .eq('main_product_id', product.id);

            if (!equivError && equivalents) {
                setEquivalents(equivalents);
            }

            // Cargar datos de ventas recientes (últimos 90 días)
            const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
            const { data: sales, error: salesError } = await supabase
                .from('order_items')
                .select('quantity, unit_price, created_at, order_id')
                .eq('sku', product.sku)
                .gte('created_at', startDate)
                .order('created_at', { ascending: false })
                .limit(10);

            if (!salesError && sales) {
                setSalesData(sales);
            }

            // Cargar datos del proveedor (costo y stock)
            const { data: supplierData, error: supplierError } = await supabase
                .from('supplier_stock_items')
                .select('*')
                .eq('sku', product.sku)
                .single();

            if (!supplierError && supplierData) {
                setSupplierStock(supplierData);
            }

            setProductDetails(product);
        } catch (error) {
            console.error('Error cargando detalles del producto:', error);
            showMessage('Error cargando información del producto', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    if (!product) return null;

    const supplier = suppliers?.find(s => s.id === product.supplier_id);
    const oemNumbers = references.filter(r => r.reference_type === 'oem');
    const crossReferences = references.filter(r => r.reference_type === 'cross_reference');

    // Calcular métricas
    const totalSales = salesData.reduce((sum, sale) => sum + (sale.quantity || 0), 0);
    const totalRevenue = salesData.reduce((sum, sale) => sum + ((sale.quantity || 0) * (sale.unit_price || 0)), 0);
    const avgSalePrice = totalSales > 0 ? totalRevenue / totalSales : 0;

    // Estado de precios
    const getPricingStatus = () => {
        if (!product.cost_price || product.cost_price <= 0) {
            return { status: 'error', message: 'Sin precio de costo', color: 'text-red-400' };
        }
        if (supplierStock && supplierStock.cost_price !== product.cost_price) {
            return { status: 'warning', message: 'Precio desactualizado', color: 'text-yellow-400' };
        }
        if (!product.sale_price || product.sale_price <= 0) {
            return { status: 'warning', message: 'Sin precio de venta', color: 'text-yellow-400' };
        }
        return { status: 'ok', message: 'Precios actualizados', color: 'text-green-400' };
    };

    const pricingStatus = getPricingStatus();

    // Calcular margen de ganancia
    const profitMargin = product.cost_price > 0 && product.sale_price > 0 
        ? ((product.sale_price - product.cost_price) / product.cost_price) * 100 
        : 0;

    const formatCurrency = (value) => {
        const num = parseFloat(value);
        if (isNaN(num)) return '$0,00';
        return new Intl.NumberFormat('es-AR', { 
            style: 'currency', 
            currency: 'ARS',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(num);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const TabButton = ({ tabId, label, isActive, onClick }) => (
        <button
            onClick={() => onClick(tabId)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
        >
            {label}
        </button>
    );

    const InfoRow = ({ label, value, highlight = false }) => (
        <div className="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
            <span className="text-gray-400 text-sm">{label}:</span>
            <span className={`font-medium text-right ${highlight ? 'text-blue-400' : 'text-white'}`}>
                {value}
            </span>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-700 bg-gray-900">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-3xl font-bold text-white mb-2 font-mono">{product.sku}</h2>
                            <p className="text-gray-300 text-lg">{product.name}</p>
                            <div className="flex items-center gap-4 mt-3">
                                <span className="inline-block px-3 py-1 bg-blue-600 rounded-full text-white text-sm font-semibold">
                                    {product.brand || 'Sin Marca'}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${pricingStatus.color} bg-gray-700`}>
                                    <div className={`w-2 h-2 rounded-full ${
                                        pricingStatus.status === 'ok' ? 'bg-green-400' :
                                        pricingStatus.status === 'warning' ? 'bg-yellow-400' : 'bg-red-400'
                                    }`}></div>
                                    {pricingStatus.message}
                                </span>
                                {product.stock_disponible <= 0 && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold text-red-400 bg-gray-700">
                                        <div className="w-2 h-2 rounded-full bg-red-400"></div>
                                        Sin Stock
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onEdit(product)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z"></path>
                                </svg>
                                Editar
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 mt-6">
                        <TabButton tabId="general" label="General" isActive={activeTab === 'general'} onClick={setActiveTab} />
                        <TabButton tabId="pricing" label="Precios" isActive={activeTab === 'pricing'} onClick={setActiveTab} />
                        <TabButton tabId="stock" label="Stock" isActive={activeTab === 'stock'} onClick={setActiveTab} />
                        <TabButton tabId="references" label="Referencias" isActive={activeTab === 'references'} onClick={setActiveTab} />
                        <TabButton tabId="equivalents" label="Equivalencias" isActive={activeTab === 'equivalents'} onClick={setActiveTab} />
                        <TabButton tabId="sales" label="Ventas" isActive={activeTab === 'sales'} onClick={setActiveTab} />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                        </div>
                    ) : (
                        <>
                            {/* Tab: General */}
                            {activeTab === 'general' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <h3 className="text-lg font-semibold text-white mb-4">Información Básica</h3>
                                        <div className="space-y-2">
                                            <InfoRow label="SKU" value={product.sku} highlight />
                                            <InfoRow label="Nombre" value={product.name || 'N/A'} />
                                            <InfoRow label="Marca" value={product.brand || 'N/A'} />
                                            <InfoRow label="Rubro" value={product.rubro || 'N/A'} />
                                            <InfoRow label="Subrubro" value={product.subrubro || 'N/A'} />
                                        </div>
                                    </div>

                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <h3 className="text-lg font-semibold text-white mb-4">Proveedor</h3>
                                        <div className="space-y-2">
                                            <InfoRow label="Proveedor" value={supplier?.name || 'N/A'} />
                                            <InfoRow label="Markup Aplicado" value={supplier?.markup ? `${supplier.markup}%` : 'N/A'} />
                                            <InfoRow label="Stock en Proveedor" value={supplierStock?.stock_quantity || 'N/A'} />
                                            <InfoRow label="Costo Proveedor" value={supplierStock?.cost_price ? formatCurrency(supplierStock.cost_price) : 'N/A'} />
                                        </div>
                                    </div>

                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <h3 className="text-lg font-semibold text-white mb-4">Estadísticas de Venta</h3>
                                        <div className="space-y-2">
                                            <InfoRow label="Ventas (90 días)" value={`${totalSales} unidades`} />
                                            <InfoRow label="Ingresos (90 días)" value={formatCurrency(totalRevenue)} />
                                            <InfoRow label="Precio Promedio Venta" value={avgSalePrice > 0 ? formatCurrency(avgSalePrice) : 'N/A'} />
                                            <InfoRow label="Última Venta" value={salesData.length > 0 ? formatDate(salesData[0].created_at) : 'N/A'} />
                                        </div>
                                    </div>

                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <h3 className="text-lg font-semibold text-white mb-4">Resumen</h3>
                                        <div className="space-y-2">
                                            <InfoRow label="Números OEM" value={`${oemNumbers.length} registrados`} />
                                            <InfoRow label="Referencias Cruzadas" value={`${crossReferences.length} registradas`} />
                                            <InfoRow label="Equivalencias" value={`${equivalents.length} productos`} />
                                            <InfoRow label="Estado General" value={
                                                (product.stock_disponible || 0) > 0 && product.cost_price > 0 
                                                    ? 'Disponible para Venta' 
                                                    : 'Requiere Atención'
                                            } />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tab: Precios */}
                            {activeTab === 'pricing' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-lg font-semibold text-white">Estructura de Precios</h3>
                                            {pricingStatus.status !== 'ok' && (
                                                <button
                                                    onClick={() => onSyncPrice(product.id)}
                                                    className="px-3 py-1 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors"
                                                >
                                                    Sincronizar
                                                </button>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <InfoRow label="Costo Base" value={formatCurrency(product.cost_price)} />
                                            <InfoRow label="Markup del Proveedor" value={supplier?.markup ? `${supplier.markup}%` : 'N/A'} />
                                            <InfoRow label="Precio de Venta" value={formatCurrency(product.sale_price)} highlight />
                                            <InfoRow label="Margen de Ganancia" value={profitMargin > 0 ? `${profitMargin.toFixed(1)}%` : 'N/A'} />
                                            <InfoRow label="Ganancia por Unidad" value={
                                                product.cost_price > 0 && product.sale_price > 0 
                                                    ? formatCurrency(product.sale_price - product.cost_price)
                                                    : 'N/A'
                                            } />
                                        </div>
                                    </div>

                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <h3 className="text-lg font-semibold text-white mb-4">Comparación con Proveedor</h3>
                                        <div className="space-y-2">
                                            <InfoRow 
                                                label="Costo Actual" 
                                                value={formatCurrency(product.cost_price)} 
                                            />
                                            <InfoRow 
                                                label="Costo en Proveedor" 
                                                value={supplierStock?.cost_price ? formatCurrency(supplierStock.cost_price) : 'N/A'} 
                                            />
                                            {supplierStock?.cost_price && (
                                                <InfoRow 
                                                    label="Diferencia" 
                                                    value={
                                                        Math.abs(supplierStock.cost_price - product.cost_price) > 0.01
                                                            ? `${formatCurrency(Math.abs(supplierStock.cost_price - product.cost_price))} ${
                                                                supplierStock.cost_price > product.cost_price ? '(Mayor)' : '(Menor)'
                                                            }`
                                                            : 'Sincronizado'
                                                    }
                                                />
                                            )}
                                            <InfoRow 
                                                label="Última Actualización" 
                                                value={product.updated_at ? formatDate(product.updated_at) : 'N/A'} 
                                            />
                                        </div>
                                    </div>

                                    {avgSalePrice > 0 && (
                                        <div className="bg-gray-900 rounded-lg p-4">
                                            <h3 className="text-lg font-semibold text-white mb-4">Análisis de Precios</h3>
                                            <div className="space-y-2">
                                                <InfoRow label="Precio Lista" value={formatCurrency(product.sale_price)} />
                                                <InfoRow label="Precio Promedio Real" value={formatCurrency(avgSalePrice)} />
                                                <InfoRow 
                                                    label="Variación" 
                                                    value={`${((avgSalePrice - product.sale_price) / product.sale_price * 100).toFixed(1)}%`} 
                                                />
                                                <InfoRow 
                                                    label="Oportunidad" 
                                                    value={
                                                        avgSalePrice > product.sale_price 
                                                            ? 'Aumentar precio' 
                                                            : avgSalePrice < product.sale_price 
                                                                ? 'Revisar competitividad'
                                                                : 'Precio óptimo'
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Tab: Stock */}
                            {activeTab === 'stock' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <h3 className="text-lg font-semibold text-white mb-4">Estado de Stock</h3>
                                        <div className="space-y-2">
                                            <InfoRow label="Stock Total" value={product.stock_total || 0} />
                                            <InfoRow label="Stock Reservado" value={product.stock_reservado || 0} />
                                            <InfoRow 
                                                label="Stock Disponible" 
                                                value={product.stock_disponible || 0} 
                                                highlight 
                                            />
                                            <InfoRow 
                                                label="Estado" 
                                                value={
                                                    (product.stock_disponible || 0) > 10 ? 'Excelente' :
                                                    (product.stock_disponible || 0) > 5 ? 'Bueno' :
                                                    (product.stock_disponible || 0) > 0 ? 'Crítico' : 'Sin Stock'
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <h3 className="text-lg font-semibold text-white mb-4">Stock del Proveedor</h3>
                                        <div className="space-y-2">
                                            <InfoRow 
                                                label="Stock en Proveedor" 
                                                value={supplierStock?.stock_quantity ? `${supplierStock.stock_quantity} unidades` : 'No disponible'} 
                                            />
                                            <InfoRow 
                                                label="Disponible para Pedido" 
                                                value={supplierStock?.available_for_order ? 'Sí' : 'No'} 
                                            />
                                            <InfoRow 
                                                label="Última Actualización" 
                                                value={supplierStock?.updated_at ? formatDate(supplierStock.updated_at) : 'N/A'} 
                                            />
                                            <InfoRow 
                                                label="Recomendación" 
                                                value={
                                                    (product.stock_disponible || 0) === 0 && supplierStock?.stock_quantity > 0
                                                        ? 'Considerar reposición'
                                                        : (product.stock_disponible || 0) > 0 
                                                            ? 'Stock suficiente'
                                                            : 'Evaluar demanda'
                                                }
                                            />
                                        </div>
                                    </div>

                                    {/* Alternativas con stock */}
                                    {equivalents.length > 0 && (
                                        <div className="bg-gray-900 rounded-lg p-4 md:col-span-2">
                                            <h3 className="text-lg font-semibold text-white mb-4">Stock de Equivalencias</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm text-gray-300">
                                                    <thead className="text-xs text-gray-400 uppercase">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left">SKU Equivalente</th>
                                                            <th className="px-4 py-2 text-left">Nombre</th>
                                                            <th className="px-4 py-2 text-center">Stock Disponible</th>
                                                            <th className="px-4 py-2 text-right">Precio</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {equivalents.map((equiv, index) => (
                                                            <tr key={index} className="border-b border-gray-700">
                                                                <td className="px-4 py-2 font-mono">{equiv.equivalent_product.sku}</td>
                                                                <td className="px-4 py-2">{equiv.equivalent_product.name}</td>
                                                                <td className={`px-4 py-2 text-center font-semibold ${
                                                                    (equiv.equivalent_product.stock_disponible || 0) > 0 
                                                                        ? 'text-green-400' 
                                                                        : 'text-red-400'
                                                                }`}>
                                                                    {equiv.equivalent_product.stock_disponible || 0}
                                                                </td>
                                                                <td className="px-4 py-2 text-right">
                                                                    {formatCurrency(equiv.equivalent_product.sale_price)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Tab: Referencias */}
                            {activeTab === 'references' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <h3 className="text-lg font-semibold text-white mb-4">Números OEM / Originales</h3>
                                        {oemNumbers.length > 0 ? (
                                            <div className="space-y-3">
                                                {oemNumbers.map((ref, index) => (
                                                    <div key={index} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                                        <span className="font-mono text-blue-300 text-sm">{ref.reference_number}</span>
                                                        <span className="text-xs text-gray-400">{ref.brand || 'Original'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-400 text-sm">No hay números OEM registrados</p>
                                        )}
                                    </div>

                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <h3 className="text-lg font-semibold text-white mb-4">Referencias Cruzadas</h3>
                                        {crossReferences.length > 0 ? (
                                            <div className="space-y-3">
                                                {crossReferences.map((ref, index) => (
                                                    <div key={index} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                                        <span className="font-mono text-yellow-300 text-sm">{ref.reference_number}</span>
                                                        <span className="text-xs text-gray-400">Referencia</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-400 text-sm">No hay referencias cruzadas registradas</p>
                                        )}
                                    </div>

                                    <div className="bg-gray-900 rounded-lg p-4 md:col-span-2">
                                        <h3 className="text-lg font-semibold text-white mb-4">Búsqueda en el Sistema</h3>
                                        <div className="text-sm text-gray-400 space-y-2">
                                            <p><strong>Para encontrar este producto puedes buscar por:</strong></p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                                <div>
                                                    <p className="text-white font-medium">SKU Principal:</p>
                                                    <span className="font-mono text-blue-300">{product.sku}</span>
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">Marca:</p>
                                                    <span className="text-gray-300">{product.brand || 'N/A'}</span>
                                                </div>
                                                {oemNumbers.length > 0 && (
                                                    <div>
                                                        <p className="text-white font-medium">Números Originales:</p>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            {oemNumbers.slice(0, 3).map((ref, index) => (
                                                                <span key={index} className="font-mono text-blue-300 text-xs bg-gray-800 px-2 py-1 rounded">
                                                                    {ref.reference_number}
                                                                </span>
                                                            ))}
                                                            {oemNumbers.length > 3 && (
                                                                <span className="text-xs text-gray-400">+{oemNumbers.length - 3} más</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tab: Equivalencias */}
                            {activeTab === 'equivalents' && (
                                <div className="space-y-6">
                                    {equivalents.length > 0 ? (
                                        <div className="bg-gray-900 rounded-lg p-4">
                                            <h3 className="text-lg font-semibold text-white mb-4">Productos Equivalentes</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm text-gray-300">
                                                    <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left">SKU</th>
                                                            <th className="px-4 py-3 text-left">Nombre</th>
                                                            <th className="px-4 py-3 text-left">Marca</th>
                                                            <th className="px-4 py-3 text-center">Stock</th>
                                                            <th className="px-4 py-3 text-right">Costo</th>
                                                            <th className="px-4 py-3 text-right">Precio</th>
                                                            <th className="px-4 py-3 text-center">Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {equivalents.map((equiv, index) => (
                                                            <tr key={index} className="border-b border-gray-700 hover:bg-gray-800">
                                                                <td className="px-4 py-3 font-mono text-blue-300">{equiv.equivalent_product.sku}</td>
                                                                <td className="px-4 py-3">{equiv.equivalent_product.name}</td>
                                                                <td className="px-4 py-3">{equiv.equivalent_product.brand || 'N/A'}</td>
                                                                <td className={`px-4 py-3 text-center font-semibold ${
                                                                    (equiv.equivalent_product.stock_disponible || 0) > 0 
                                                                        ? 'text-green-400' 
                                                                        : 'text-red-400'
                                                                }`}>
                                                                    {equiv.equivalent_product.stock_disponible || 0}
                                                                </td>
                                                                <td className="px-4 py-3 text-right text-gray-400">
                                                                    {formatCurrency(equiv.equivalent_product.cost_price)}
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-semibold">
                                                                    {formatCurrency(equiv.equivalent_product.sale_price)}
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                                        (equiv.equivalent_product.stock_disponible || 0) > 0
                                                                            ? 'bg-green-900 text-green-300'
                                                                            : 'bg-red-900 text-red-300'
                                                                    }`}>
                                                                        {(equiv.equivalent_product.stock_disponible || 0) > 0 ? 'Disponible' : 'Sin Stock'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-900 rounded-lg p-8 text-center">
                                            <svg className="mx-auto h-16 w-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"></path>
                                            </svg>
                                            <h3 className="text-lg font-medium text-gray-300 mb-2">No hay equivalencias registradas</h3>
                                            <p className="text-gray-400 text-sm">
                                                Para agregar productos equivalentes, usa el botón "Editar" y ve a la sección de Equivalencias.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Tab: Ventas */}
                            {activeTab === 'sales' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-gray-900 rounded-lg p-4 text-center">
                                            <h4 className="text-2xl font-bold text-blue-400">{totalSales}</h4>
                                            <p className="text-gray-400 text-sm">Unidades Vendidas (90d)</p>
                                        </div>
                                        <div className="bg-gray-900 rounded-lg p-4 text-center">
                                            <h4 className="text-2xl font-bold text-green-400">{formatCurrency(totalRevenue)}</h4>
                                            <p className="text-gray-400 text-sm">Ingresos Generados (90d)</p>
                                        </div>
                                        <div className="bg-gray-900 rounded-lg p-4 text-center">
                                            <h4 className="text-2xl font-bold text-yellow-400">
                                                {avgSalePrice > 0 ? formatCurrency(avgSalePrice) : 'N/A'}
                                            </h4>
                                            <p className="text-gray-400 text-sm">Precio Promedio</p>
                                        </div>
                                    </div>

                                    {salesData.length > 0 ? (
                                        <div className="bg-gray-900 rounded-lg p-4">
                                            <h3 className="text-lg font-semibold text-white mb-4">Historial de Ventas Recientes</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm text-gray-300">
                                                    <thead className="text-xs text-gray-400 uppercase bg-gray-800">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left">Fecha</th>
                                                            <th className="px-4 py-3 text-center">Cantidad</th>
                                                            <th className="px-4 py-3 text-right">Precio Unitario</th>
                                                            <th className="px-4 py-3 text-right">Total</th>
                                                            <th className="px-4 py-3 text-center">Orden</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {salesData.map((sale, index) => (
                                                            <tr key={index} className="border-b border-gray-700 hover:bg-gray-800">
                                                                <td className="px-4 py-3">{formatDate(sale.created_at)}</td>
                                                                <td className="px-4 py-3 text-center font-semibold">{sale.quantity}</td>
                                                                <td className="px-4 py-3 text-right">{formatCurrency(sale.unit_price)}</td>
                                                                <td className="px-4 py-3 text-right font-semibold text-green-400">
                                                                    {formatCurrency(sale.quantity * sale.unit_price)}
                                                                </td>
                                                                <td className="px-4 py-3 text-center text-blue-400">#{sale.order_id}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-900 rounded-lg p-8 text-center">
                                            <svg className="mx-auto h-16 w-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"></path>
                                            </svg>
                                            <h3 className="text-lg font-medium text-gray-300 mb-2">Sin historial de ventas</h3>
                                            <p className="text-gray-400 text-sm">
                                                No se encontraron ventas de este producto en los últimos 90 días.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductDetailModal;