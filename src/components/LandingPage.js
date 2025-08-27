// Ruta: src/components/LandingPage.js

import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
    return (
        <div className="antialiased" style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#0f172a", color: "#cbd5e1" }}>
            <style>{`
                html { scroll-behavior: smooth; }
                .hero-gradient-text { background: linear-gradient(to right, #34d399, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .feature-card { background-color: #1e293b; border: 1px solid #334155; transition: transform 0.3s ease, box-shadow 0.3s ease; }
                .feature-card:hover { transform: translateY(-8px); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); }
                .btn-primary { background: linear-gradient(to right, #10b981, #3b82f6); transition: all 0.3s ease; }
                .btn-primary:hover { transform: scale(1.05); box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
            `}</style>
            
            <header className="bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-800">
                <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
                    <a href="#hero" className="flex items-center space-x-3">
                        <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAQABAADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigA" alt="ProdFlow Logo" className="h-10 w-auto" />
                        <span className="text-xl font-bold text-white">ProdFlow</span>
                    </a>
                    <div className="hidden md:flex items-center space-x-8">
                        <a href="#features" className="text-slate-300 hover:text-white transition-colors">Características</a>
                        <a href="#how-it-works" className="text-slate-300 hover:text-white transition-colors">¿Cómo Funciona?</a>
                        <a href="#roadmap" className="text-slate-300 hover:text-white transition-colors">Hoja de Ruta</a>
                    </div>
                    {/* El botón ahora es un Link de React Router */}
                    <Link to="/app" className="btn-primary text-white font-semibold px-6 py-2 rounded-lg shadow-lg">
                        Iniciar Sesión
                    </Link>
                </nav>
            </header>

            <main>
                <section id="hero" className="py-20 md:py-32">
                    <div className="container mx-auto px-6 text-center">
                        <div className="max-w-3xl mx-auto">
                            <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-6">
                                La <span className="hero-gradient-text">Inteligencia de Inventario</span> que tu E-commerce necesita.
                            </h1>
                            <p className="text-lg md:text-xl text-slate-400 mb-10">
                                Automatiza tu stock, optimiza tus precios y sincroniza tus publicaciones en Mercado Libre sin esfuerzo. Concéntrate en vender, nosotros nos encargamos del resto.
                            </p>
                            <Link to="/app" className="btn-primary text-white font-bold px-8 py-4 rounded-lg shadow-xl text-lg">
                                Acceder a la Aplicación
                            </Link>
                        </div>
                    </div>
                </section>

                <section id="features" className="py-20 bg-slate-900/70">
                    <div className="container mx-auto px-6">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-4xl font-bold text-white">Todo lo que necesitas, en un solo lugar.</h2>
                            <p className="text-slate-400 mt-2">Desde la gestión de proveedores hasta el análisis de la competencia.</p>
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                            <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">📦</div>
                                <h3 className="text-xl font-bold text-white mb-2">Inventario Multi-Depósito</h3>
                                <p className="text-slate-400">Consolida el stock de tu depósito propio y el de todos tus proveedores en una sola vista.</p>
                            </div>
                            <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">🔄</div>
                                <h3 className="text-xl font-bold text-white mb-2">Sincronización Automática</h3>
                                <p className="text-slate-400">Actualiza stock y precios en Mercado Libre en tiempo real.</p>
                            </div>
                            <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">🧠</div>
                                <h3 className="text-xl font-bold text-white mb-2">Inteligencia de Precios</h3>
                                <p className="text-slate-400">Define tus márgenes de ganancia y deja que ProdFlow calcule el precio de venta óptimo.</p>
                            </div>
                             <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">📈</div>
                                <h3 className="text-xl font-bold text-white mb-2">Proyección de Demanda</h3>
                                <p className="text-slate-400">Analizamos tu historial de ventas para proyectar tus necesidades de stock futuras.</p>
                            </div>
                             <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">🏷️</div>
                                <h3 className="text-xl font-bold text-white mb-2">Etiquetas Personalizadas</h3>
                                <p className="text-slate-400">Genera hojas de picking optimizadas junto a la etiqueta oficial de Mercado Libre.</p>
                            </div>
                             <div className="feature-card rounded-xl p-8">
                                <div className="text-4xl mb-4">👑</div>
                                <h3 className="text-xl font-bold text-white mb-2">Análisis de Competencia</h3>
                                <p className="text-slate-400">Monitorea a tus competidores para tomar decisiones estratégicas y ganar en ventas.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="how-it-works" className="py-20">
                     <div className="container mx-auto px-6">
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-4xl font-bold text-white">¿Cómo Funciona?</h2>
                            <p className="text-slate-400 mt-2 max-w-2xl mx-auto">Un ciclo de automatización simple y poderoso que conecta todas las partes de tu negocio.</p>
                        </div>
                        <div className="flex flex-col md:flex-row justify-center items-center gap-8 md:gap-0">
                            <div className="text-center max-w-xs p-6 border border-slate-700 rounded-lg bg-slate-800">
                                <div className="text-3xl mb-3">📂</div>
                                <h3 className="font-bold text-white text-lg mb-2">1. Conecta tus Fuentes</h3>
                                <p className="text-sm text-slate-400">Vincula tu cuenta de Mercado Libre y configura la carpeta de Dropbox de tus proveedores.</p>
                            </div>
                            <div className="w-16 h-1 bg-slate-700 md:w-24 md:h-1"></div>
                             <div className="text-center max-w-xs p-6 border border-slate-700 rounded-lg bg-slate-800">
                                <div className="text-3xl mb-3">🤖</div>
                                <h3 className="font-bold text-white text-lg mb-2">2. ProdFlow Procesa</h3>
                                <p className="text-sm text-slate-400">Nuestro motor se activa, lee el stock, lo suma al tuyo y recalcula precios y cantidades.</p>
                            </div>
                            <div className="w-16 h-1 bg-slate-700 md:w-24 md:h-1"></div>
                             <div className="text-center max-w-xs p-6 border border-slate-700 rounded-lg bg-slate-800">
                                <div className="text-3xl mb-3">✅</div>
                                <h3 className="font-bold text-white text-lg mb-2">3. Vende sin Preocupaciones</h3>
                                <p className="text-sm text-slate-400">Tus publicaciones se pausan, activan y actualizan solas. Tu única tarea es gestionar las ventas.</p>
                            </div>
                        </div>
                     </div>
                </section>

                <section id="cta" className="py-20 bg-slate-900/70">
                    <div className="container mx-auto px-6 text-center">
                        <div className="max-w-2xl mx-auto">
                            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">¿Listo para tomar el control de tu inventario?</h2>
                            <p className="text-slate-400 mb-8">Deja de perder tiempo en tareas manuales y empieza a tomar decisiones basadas en datos.</p>
                             <Link to="/app" className="btn-primary text-white font-bold px-8 py-4 rounded-lg shadow-xl text-lg">
                                Ir a mi Panel de Control
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-slate-800">
                <div className="container mx-auto px-6 py-6 text-center text-slate-500 text-sm">
                    <p>&copy; 2025 ProdFlow. Todos los derechos reservados.</p>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
