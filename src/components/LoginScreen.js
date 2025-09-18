import React, { useState } from 'react';
import { supabase } from '../supabaseClient';

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            let response;
            if (isLogin) {
                response = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
            } else {
                response = await supabase.auth.signUp({
                    email,
                    password,
                });
            }

            if (response.error) {
                throw response.error;
            }

        } catch (err) {
            let friendlyError = "Ocurrió un error. Inténtalo de nuevo.";
            if (err.message.includes("Invalid login credentials")) {
                friendlyError = "Correo o contraseña incorrectos.";
            } else if (err.message.includes("User already registered")) {
                friendlyError = "Este correo electrónico ya está registrado.";
            } else if (err.message.includes("Password should be at least 6 characters")) {
                friendlyError = "La contraseña debe tener al menos 6 caracteres.";
            }
            setError(friendlyError);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center p-4">
            {/* Elementos de fondo decorativos */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse animation-delay-2000"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-5 animate-pulse animation-delay-4000"></div>
            </div>

            <div className="relative w-full max-w-md">
                {/* Contenedor principal con glassmorphism */}
                <div className="bg-white bg-opacity-10 backdrop-filter backdrop-blur-lg border border-white border-opacity-20 rounded-2xl shadow-2xl p-8">
                    
                    {/* Header con logo */}
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-6">
                            <div className="relative">
                                <img 
                                    src="/logo.png" 
                                    alt="ProdFlow Logo" 
                                    className="w-20 h-20 mx-auto drop-shadow-2xl"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextElementSibling.style.display = 'flex';
                                    }}
                                />
                                {/* Fallback si no carga el logo */}
                                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-2xl items-center justify-center hidden">
                                    <span className="text-2xl font-bold text-white">PF</span>
                                </div>
                                
                                {/* Efecto de brillo detrás del logo */}
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-500 rounded-2xl blur-lg opacity-30 -z-10"></div>
                            </div>
                        </div>
                        
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
                            ProdFlow
                        </h1>
                        <p className="text-gray-300 text-lg font-medium">
                            Sistema de Gestión Integral
                        </p>
                    </div>

                    {/* Selector de modo */}
                    <div className="flex mb-6 bg-gray-800 bg-opacity-50 rounded-xl p-1">
                        <button
                            type="button"
                            onClick={() => { setIsLogin(true); setError(''); }}
                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                                isLogin 
                                    ? 'bg-blue-600 text-white shadow-lg' 
                                    : 'text-gray-300 hover:text-white'
                            }`}
                        >
                            Iniciar Sesión
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsLogin(false); setError(''); }}
                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                                !isLogin 
                                    ? 'bg-blue-600 text-white shadow-lg' 
                                    : 'text-gray-300 hover:text-white'
                            }`}
                        >
                            Registrarse
                        </button>
                    </div>

                    {/* Formulario */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Correo Electrónico
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full p-4 bg-gray-800 bg-opacity-50 border border-gray-600 border-opacity-50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-filter backdrop-blur-sm"
                                placeholder="tu@email.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Contraseña
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-4 bg-gray-800 bg-opacity-50 border border-gray-600 border-opacity-50 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 backdrop-filter backdrop-blur-sm"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500 bg-opacity-20 border border-red-500 border-opacity-50 rounded-xl p-4">
                                <p className="text-red-300 text-sm text-center">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transform transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-transparent"
                        >
                            {loading ? (
                                <div className="flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                                    Procesando...
                                </div>
                            ) : (
                                isLogin ? 'Entrar a ProdFlow' : 'Crear Cuenta'
                            )}
                        </button>
                    </form>

                    {/* Footer del formulario */}
                    <div className="mt-6 text-center">
                        <p className="text-gray-400 text-sm">
                            {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
                        </p>
                        <button
                            onClick={() => { setIsLogin(!isLogin); setError(''); }}
                            className="text-blue-400 hover:text-blue-300 text-sm font-medium mt-1 transition-colors duration-200"
                        >
                            {isLogin ? 'Regístrate aquí' : 'Inicia sesión aquí'}
                        </button>
                    </div>

                    {/* Información adicional */}
                    <div className="mt-8 pt-6 border-t border-gray-600 border-opacity-30">
                        <div className="text-center">
                            <p className="text-gray-400 text-xs">
                                Gestiona tu inventario, ventas y operaciones
                            </p>
                            <p className="text-gray-500 text-xs mt-1">
                                con la plataforma integral ProdFlow
                            </p>
                        </div>
                    </div>
                </div>

                {/* Sombra adicional para profundidad */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl blur-xl opacity-20 -z-10 transform scale-95"></div>
            </div>
        </div>
    );
};

export default LoginScreen;