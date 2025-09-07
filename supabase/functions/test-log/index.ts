// supabase/functions/test-log/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

console.log("Archivo de prueba 'test-log' leído por el sistema.");

serve(async (req) => {
  console.log("¡HOLA MUNDO! La función de prueba 'test-log' fue invocada correctamente.");

  return new Response(
    JSON.stringify({ message: "La función de prueba funciona!" }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});