import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { supabase } from './supabaseClient'; // Importamos la instancia configurada (puede ser null)

// IMPORTANTE: Esta línea es la que causaba el error. Debe encontrar el archivo en la ruta correcta.
import ErrorBoundary from './components/ErrorBoundary'; 

console.log("[DIAGNÓSTICO] Iniciando index.js...");

const rootElement = document.getElementById('root');

if (!rootElement) {
    console.error("[DIAGNÓSTICO] Error crítico: No se encontró el elemento 'root' en el DOM.");
} else {
    const root = ReactDOM.createRoot(rootElement);

    // VERIFICACIÓN CRÍTICA: ¿Se inicializó Supabase correctamente?
    if (!supabase) {
        console.error("[DIAGNÓSTICO] Deteniendo renderizado. El cliente de Supabase es NULL. Renderizando pantalla de error.");
        
        // Renderizar una interfaz de respaldo clara si Supabase falló
        root.render(
            <div style={{ padding: '50px', color: '#D8000C', backgroundColor: '#FFD2D2', textAlign: 'center', fontSize: '18px', margin: '20px', borderRadius: '5px', fontFamily: 'sans-serif' }}>
                <h1>Error Crítico de Inicialización (ProdFlow)</h1>
                <p>No se pudo inicializar la conexión con la base de datos (Supabase).</p>
                <p>Esto suele ocurrir si las variables de entorno (REACT_APP_SUPABASE_URL y REACT_APP_SUPABASE_ANON_KEY) no están correctamente configuradas en el panel de Vercel.</p>
                <p><strong>Por favor, revise la consola del navegador (F12) para verificar los mensajes de [DIAGNÓSTICO].</strong></p>
            </div>
        );
    } else {
        // RENDERIZADO NORMAL DE LA APLICACIÓN
        console.log("[DIAGNÓSTICO] Cliente de Supabase presente. Intentando renderizar la aplicación React...");
        try {
            root.render(
                <React.StrictMode>
                    {/* 1. Atrapa errores durante el renderizado */}
                    <ErrorBoundary>
                        {/* 2. Provee la sesión de Supabase (requiere cliente válido) */}
                        <SessionContextProvider supabaseClient={supabase}>
                            {/* 3. Maneja las rutas */}
                            <BrowserRouter>
                                <App />
                            </BrowserRouter>
                        </SessionContextProvider>
                    </ErrorBoundary>
                </React.StrictMode>
            );
            console.log("[DIAGNÓSTICO] Llamada a root.render completada.");
        } catch (error) {
            // Captura errores síncronos durante el renderizado inicial (raro, pero posible)
            console.error("[DIAGNÓSTICO] Fallo síncrono durante root.render:", error);
        }
    }
}
// FORZANDO ACTUALIZACIÓN PARA GIT - 001
reportWebVitals();