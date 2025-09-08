// supabase/functions/get-ml-labels/index.ts
// PRUEBA DE DIAGNÓSTICO: Generar un PDF simple con "Hola Mundo"

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Iniciando prueba de PDF 'Hola Mundo'...");

    // 1. Crear un documento PDF vacío
    const pdfDoc = await PDFDocument.create();
    
    // 2. Añadir una página
    const page = pdfDoc.addPage([283, 421]); // Tamaño A6
    const { height } = page.getSize();
    
    // 3. Cargar una fuente estándar
    console.log("Cargando fuente...");
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    console.log("Fuente cargada.");

    // 4. Escribir texto en la página
    console.log("Dibujando texto...");
    page.drawText("¡Hola Mundo!", {
      x: 50,
      y: height - 50,
      font: font,
      size: 30,
      color: rgb(0, 0, 0), // Color negro
    });
    console.log("Texto dibujado.");

    // 5. Guardar el PDF y devolverlo
    console.log("Guardando y devolviendo el PDF...");
    const pdfBytes = await pdfDoc.save();
    
    return new Response(pdfBytes, {
      headers: { ...corsHeaders, 'Content-Type': 'application/pdf' }
    });

  } catch (error) {
    console.error("Error en la prueba 'Hola Mundo' PDF:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});