// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

// Leemos las variables desde el entorno (Vercel usará las que configuramos)
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Creamos el cliente con esas variables
export const supabase = createClient(supabaseUrl, supabaseAnonKey)