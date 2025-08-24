import React, { useState } from 'react';
// 1. Importamos el cliente de Supabase
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
                // 2. Lógica de inicio de sesión con Supabase
                response = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
            } else {
                // 3. Lógica de registro con Supabase
                response = await supabase.auth.signUp({
                    email,
                    password,
                    // Opcional: podemos añadir metadatos al usuario aquí
                    // options: { data: { role: 'admin' } }
                });
            }

            // 4. Manejo de errores de Supabase
            if (response.error) {
                throw response.error;
            }
            
            // Si el registro es exitoso, Supabase puede requerir confirmación por email.
            if (!isLogin && response.data.user) {
                 // Por ahora, no hacemos nada, onAuthStateChange lo manejará.
                 // Podríamos mostrar un mensaje de "Revisa tu email para confirmar".
            }

        } catch (err) {
            // Mapeo de errores de Supabase a español
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
        // 5. Rediseño a tema oscuro
        <div className="min-h-screen bg-gray-900 text-gray-300 flex items-center justify-center p-4">
            <div className="bg-gray-800 border border-gray-700 p-8 rounded-lg shadow-lg w-full max-w-md">
                <h1 className="text-3xl font-bold text-center text-white mb-4">ProdFlow 🚀</h1>
                <h2 className="text-xl font-semibold text-center text-gray-400 mb-6">
                    {isLogin ? 'Iniciar Sesión' : 'Registrar Nueva Cuenta'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Correo Electrónico</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full p-3 mt-1 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 mt-1 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Procesando...' : (isLogin ? 'Entrar' : 'Registrarse')}
                        </button>
                    </div>
                </form>
                <div className="mt-6 text-center">
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="text-sm text-blue-400 hover:underline"
                    >
                        {isLogin ? '¿No tienes una cuenta? Regístrate' : '¿Ya tienes una cuenta? Inicia sesión'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
