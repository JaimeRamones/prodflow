import { createClient } from '@supabase/supabase-js';

console.log("[DIAGNÓSTICO] Iniciando supabaseClient.js...");

// Usamos el prefijo REACT_APP_ requerido por Create React App
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Verificación explícita
console.log("[DIAGNÓSTICO] Verificando variables de entorno:");

if (supabaseUrl) {
    // Mostramos parcialmente para confirmar sin exponer la clave completa en la consola
    console.log(`[DIAGNÓSTICO] REACT_APP_SUPABASE_URL: Presente (Inicia con: ${supabaseUrl.substring(0, 15)}...)`);
} else {
    console.error("[DIAGNÓSTICO] REACT_APP_SUPABASE_URL: ¡AUSENTE O VACÍA!");
}

if (supabaseAnonKey) {
    console.log(`[DIAGNÓSTICO] REACT_APP_SUPABASE_ANON_KEY: Presente (Longitud: ${supabaseAnonKey.length})`);
} else {
    console.error("[DIAGNÓSTICO] REACT_APP_SUPABASE_ANON_KEY: ¡AUSENTE O VACÍA!");
}

let supabaseInstance = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    console.log("[DIAGNÓSTICO] Intentando ejecutar createClient...");
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    console.log("[DIAGNÓSTICO] Cliente de Supabase creado exitosamente.");
  } catch (error) {
    console.error("[DIAGNÓSTICO] Error inesperado durante createClient:", error);
  }
} else {
    console.error("[DIAGNÓSTICO] No se intentó crear el cliente de Supabase debido a la falta de variables.");
}

// Exportamos la instancia (puede ser null si falló)
export const supabase = supabaseInstance;