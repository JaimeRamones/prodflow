import React, { useRef, useEffect, useContext, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { AppContext } from '../App';

// --- Componente de Gráfico de Stock por Rubro ---
const StockByCategoryChart = ({ products }) => {
    const chartRef = useRef(null);
    const chartInstance = useRef(null); 

    useEffect(() => {
        if (!products || products.length === 0 || !chartRef.current) return;
        
        const categoryData = products.reduce((acc, product) => {
            const category = product.rubro || 'Sin Rubro';
            acc[category] = (acc[category] || 0) + (product.stock_total || 0);
            return acc;
        }, {});

        const labels = Object.keys(categoryData);
        const data = Object.values(categoryData);
        const ctx = chartRef.current.getContext('2d');
        
        if (chartInstance.current) chartInstance.current.destroy();
        
        chartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels, 
                datasets: [{ 
                    label: 'Stock Total', 
                    data, 
                    backgroundColor: 'rgba(59, 130, 246, 0.5)', 
                    borderColor: 'rgba(59, 130, 246, 1)', 
                    borderWidth: 1 
                }] 
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Stock por Rubro', color: '#E5E7EB', font: { size: 16 } },
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
                    x: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
                }
            }
        });

        return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [products]);

    return <div className="relative h-80 w-full"><canvas ref={chartRef}></canvas></div>;
};

// --- Componente Principal del Dashboard ---
const Dashboard = () => {
    const { products, suppliers, session } = useContext(AppContext);
    
    const stats = useMemo(() => {
        if (!products) return { totalInventoryValue: 0, totalSkus: 0, totalUnits: 0 };
        
        // CORRECCIÓN: Usamos los nombres de columna de Supabase
        const totalUnits = products.reduce((sum, product) => sum + (product.stock_total || 0), 0);
        const totalInventoryValue = products.reduce((sum, product) => sum + (product.stock_total || 0) * (product.cost_price || 0), 0);
        
        return {
            totalInventoryValue,
            totalSkus: products.length,
            totalUnits,
            totalSuppliers: suppliers.length
        };
    }, [products, suppliers]);

    const userEmail = session?.user?.email || 'Usuario';

    const StatCard = ({ title, value, format = (v) => v }) => (
        <div className="bg-gray-800 p-4 rounded-lg shadow-md text-center border border-gray-700">
            <h3 className="text-lg font-semibold text-gray-400">{title}</h3>
            <p className="text-3xl font-bold text-white">{format(value)}</p>
        </div>
    );

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-2">Panel de Control</h2>
            <p className="text-lg text-gray-400 mb-8">Bienvenido de nuevo, <span className="font-semibold text-white">{userEmail}</span>.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard 
                    title="Valor del Inventario" 
                    value={stats.totalInventoryValue} 
                    format={(v) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v)}
                />
                <StatCard title="SKUs Únicos" value={stats.totalSkus} />
                <StatCard title="Unidades Totales" value={stats.totalUnits} />
                <StatCard title="Proveedores" value={stats.totalSuppliers} />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700">
                    <StockByCategoryChart products={products} />
                </div>
                <div className="bg-gray-800 p-4 rounded-lg shadow-md border border-gray-700 flex items-center justify-center">
                    <p className="text-gray-500">Gráfico de Top Ventas (Próximamente)</p>
                </div>
            </div>
            
            <div className="mt-8">
                <h3 className="text-xl font-semibold text-white mb-4">Alertas de Bajo Stock</h3>
                <div className="bg-gray-800 p-4 rounded-lg text-center border border-gray-700">
                    <p className="text-gray-500">Funcionalidad de Alertas (Próximamente)</p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
