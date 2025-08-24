// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cnbsqjdmyqxlvtxmvcsp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNuYnNxamRteXF4bHZ0eG12Y3NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MDc4MDAsImV4cCI6MjA3MTM4MzgwMH0.hm-nr8VChfBi6WkVth3MJU9Al-EhiZgpUgQZfj6Nio8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);