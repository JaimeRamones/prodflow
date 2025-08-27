import React from 'react';
import { Link } from 'react-router-dom';
// CORRECCIÓN: Se cambió la extensión a .png
import prodflowLogo from '../assets/prodflow-logo.png'; 

const LandingPage = () => {
    // Estilos en línea para evitar la necesidad de un archivo CSS separado por ahora
    const styles = `
        body {
            font-family: 'Inter', sans-serif;
        }
        .hero-gradient-text {
            background: linear-gradient(to right, #34d399, #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .btn-primary {
            background: linear-gradient(to right, #10b981, #3b82f6);
            transition: all 0.3s ease;
        }
        .btn-primary:hover {
            transform: scale(1.05);
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
        }
        .feature-card {
            background-color: #1e293b;
            border: 1px solid #334155;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .feature-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
    `;

    return (
        <>
            <style>{styles}</style>
            <div className="bg-slate-900 text-slate-300">
                {/* Header */}
                <header className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-800">
                    <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                            <img src={prodflowLogo} alt="Logo de ProdFlow" className="h-10 w-auto" />
                            <span className="text-2xl font-bold text-white">ProdFlow</span>
                        </div>
                        <Link to="/app" className="btn-primary text-white font-semibold px-5 py-2 rounded-lg">
                            Ir a la App
                        </Link>
                    </div>
                </header>

                {/* Main Content */}
                <main>
                    <section className="py-20 md:py-28">
                        <div className="container mx-auto px-6 text-center">
                            <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-4">
                                La <span className="hero-gradient-text">Inteligencia de Inventario</span> que tu tienda necesita.
                            </h1>
                            <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-8">
                                Sincroniza el stock de tu depósito y proveedores en tiempo real. Vende más, evita quiebres de stock y optimiza tus precios automáticamente.
                            </p>
                            <Link to="/app" className="btn-primary text-white font-bold px-8 py-4 rounded-lg text-lg shadow-lg">
                                Automatiza tu operación ahora
                            </Link>
                        </div>
                    </section>

                    {/* Features Section */}
                    <section id="features" className="py-20 bg-slate-900">
                        <div className="container mx-auto px-6">
                            <div className="text-center mb-12">
                                <h2 className="text-3xl md:text-4xl font-bold text-white">Deja de gestionar, empieza a vender</h2>
                                <p className="text-lg text-slate-400 mt-2">ProdFlow es el motor que trabaja por ti.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                <div className="feature-card p-8 rounded-xl">
                                    <div className="text-3xl mb-4">📦</div>
                                    <h3 className="text-xl font-bold text-white mb-2">Stock Unificado</h3>
                                    <p className="text-slate-400">Integramos tu inventario propio con el de todos tus proveedores.</p>
                                </div>
                                <div className="feature-card p-8 rounded-xl">
                                    <div className="text-3xl mb-4">💡</div>
                                    <h3 className="text-xl font-bold text-white mb-2">Precios Inteligentes</h3>
                                    <p className="text-slate-400">ProdFlow calcula el precio de venta basándose en el proveedor más económico y tu margen.</p>
                                </div>
                                <div className="feature-card p-8 rounded-xl">
                                    <div className="text-3xl mb-4">⚙️</div>
                                    <h3 className="text-xl font-bold text-white mb-2">Automatización Total</h3>
                                    <p className="text-slate-400">Pausa y reactiva publicaciones, procesa ventas y reserva stock sin que muevas un dedo.</p>
                                </div>
                            </div>
                        </div>
                    </section>
                </main>

                {/* Footer */}
                <footer className="border-t border-slate-800">
                    <div className="container mx-auto px-6 py-8 text-center">
                        <p className="text-slate-400">&copy; 2024 ProdFlow. Todos los derechos reservados.</p>
                    </div>
                </footer>
            </div>
        </>
    );
};

export default LandingPage;
