// supabase/functions/generate-shipping-label/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"; // Importamos la librería de PDF
import { corsHeaders } from "../_shared/cors.ts";

// (La función getMeliToken es la misma que ya usamos, la necesitamos aquí también)
async function getMeliToken(supabaseClient, userId) {
  const { data: creds } = await supabaseClient.from("meli_credentials").select("access_token, refresh_token, last_updated").eq("user_id", userId).single();
  if (!creds) throw new Error("Credenciales no encontradas.");
  const tokenAge = (new Date().getTime() - new Date(creds.last_updated).getTime()) / 1000;
  if (tokenAge < 21600) return creds.access_token;
  
  const MELI_CLIENT_ID = Deno.env.get("MELI_CLIENT_ID");
  const MELI_CLIENT_SECRET = Deno.env.get("MELI_CLIENT_SECRET");
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: MELI_CLIENT_ID, client_secret: MELI_CLIENT_SECRET, refresh_token: creds.refresh_token }),
  });
  if (!response.ok) throw new Error("Error al refrescar token de ML.");
  const tokenData = await response.json();
  await supabaseClient.from("meli_credentials").update({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, last_updated: new Date().toISOString() }).eq("user_id", userId);
  return tokenData.access_token;
}


serve(async (req) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: corsHeaders }); }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");
    
    const { order_id, format } = await req.json();
    if (!order_id || !format) throw new Error("Faltan parámetros: order_id o format.");

    // 1. Obtener datos de nuestra base de datos
    const { data: orderData, error: orderError } = await supabase
        .from('sales_orders')
        .select('*, order_items(*)')
        .eq('id', order_id)
        .single();
    if (orderError) throw orderError;

    // 2. Obtener datos del envío desde la API de Mercado Libre
    const accessToken = await getMeliToken(supabase, user.id);
    const shippingResp = await fetch(`https://api.mercadolibre.com/shipments/${orderData.shipping_id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!shippingResp.ok) throw new Error("No se pudieron obtener los datos de envío de Mercado Libre.");
    const shippingData = await shippingResp.json();
    const receiverAddress = shippingData.receiver_address;

    // --- LÓGICA DE LA ETIQUETA PERSONALIZADA ---
    if (format === 'pdf') {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Título
        page.drawText(`Etiqueta de Envío - Venta #${orderData.meli_order_id}`, { x: 50, y: height - 50, font, size: 18, color: rgb(0, 0, 0) });

        // Datos del Destinatario
        page.drawText('DESTINATARIO:', { x: 50, y: height - 100, font, size: 12 });
        page.drawText(`${receiverAddress.receiver_name}`, { x: 60, y: height - 120, font, size: 14 });
        page.drawText(`${receiverAddress.street_name} ${receiverAddress.street_number}`, { x: 60, y: height - 140, font, size: 12 });
        page.drawText(`${receiverAddress.zip_code} ${receiverAddress.city.name}, ${receiverAddress.state.name}`, { x: 60, y: height - 160, font, size: 12 });
        
        // Items del pedido y la "Marca Personalizada"
        let yPosition = height - 200;
        for (const item of orderData.order_items) {
            const { data: product } = await supabase.from('products').select('stock_disponible').eq('sku', item.sku).single();
            const hasStock = product && product.stock_disponible >= item.quantity;
            
            // La marca personalizada
            const stockIndicator = hasStock ? "[EN STOCK PROPIO]" : "[PEDIR A PROVEEDOR]";
            
            page.drawText(`${item.quantity}x  ${item.sku}  -  ${item.title}`, { x: 50, y: yPosition, font, size: 11 });
            page.drawText(stockIndicator, { x: 400, y: yPosition, font, size: 11, color: hasStock ? rgb(0, 0.5, 0) : rgb(0.8, 0, 0) });
            yPosition -= 20;
        }

        const pdfBytes = await pdfDoc.save();
        
        return new Response(pdfBytes, {
            headers: { ...corsHeaders, 'Content-Type': 'application/pdf' }
        });
    }

    // (Aquí iría la lógica para ZPL en el futuro)
    return new Response(JSON.stringify({ message: "Formato no soportado aún." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});