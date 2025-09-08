// supabase/functions/generate-shipping-label/index.ts
// VERSIÓN ROBUSTA: Maneja datos faltantes y mejora el diseño.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeaders } from "../_shared/cors.ts";

async function getMeliToken(supabaseClient, userId) {
  // ... (esta función no necesita cambios)
  const { data: creds } = await supabaseClient.from("meli_credentials").select("access_token, refresh_token, last_updated").eq("user_id", userId).single();
  if (!creds) throw new Error("Credenciales no encontradas.");
  const tokenAge = (new Date().getTime() - new Date(creds.last_updated).getTime()) / 1000;
  if (tokenAge < 21600) return creds.access_token;
  const MELI_CLIENT_ID = Deno.env.get("MELI_CLIENT_ID");
  const MELI_CLIENT_SECRET = Deno.env.get("MELI_CLIENT_SECRET");
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-form-urlencoded" },
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
    const { PDFDocument, rgb, StandardFonts } = await import("https://esm.sh/pdf-lib@1.17.1");
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization")! } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");
    
    const { order_id, format } = await req.json();
    if (!order_id) throw new Error("Falta el parámetro: order_id.");

    const { data: orderData } = await supabase.from('sales_orders').select('*, order_items(*)').eq('id', order_id).single();
    const accessToken = await getMeliToken(supabase, user.id);
    const shippingResp = await fetch(`https://api.mercadolibre.com/shipments/${orderData.shipping_id}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!shippingResp.ok) throw new Error("No se pudieron obtener los datos de envío de Mercado Libre.");
    const shippingData = await shippingResp.json();

    if (format === 'pdf') {
        // --- CÓDIGO DEFENSIVO: Usamos '|| {}' para evitar errores si los datos no existen ---
        const receiverAddress = shippingData.receiver_address || {};
        const senderAddress = shippingData.sender_address || {};

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([283, 421]); // A6 (100x148mm)
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // --- SECCIÓN 1: REMITENTE ---
        page.drawText(`Remitente: ${senderAddress.sender_id || 'N/A'}`, { x: 20, y: height - 25, font, size: 8 });
        page.drawText(`${senderAddress.address_line || 'Dirección no disponible'}`, { x: 20, y: height - 35, font, size: 8 });
        page.drawText(`Pack ID: ${orderData.meli_order_id}`, { x: 20, y: height - 45, font: fontBold, size: 9 });
        page.drawRectangle({ x: 15, y: height - 55, width: width - 30, height: 1, color: rgb(0.8, 0.8, 0.8) });

        // --- SECCIÓN 2: DATOS DE ENVÍO Y NÚMERO DE SEGUIMIENTO ---
        page.drawText("NÚMERO DE SEGUIMIENTO:", {x: 20, y: height - 100, font, size: 8});
        page.drawText(shippingData.tracking_number || 'N/A', { x: 20, y: height - 125, font: fontBold, size: 24, color: rgb(0, 0, 0) });
        page.drawRectangle({ x: 15, y: height - 140, width: width - 30, height: 1, color: rgb(0.8, 0.8, 0.8) });

        // --- SECCIÓN 3: DESTINATARIO ---
        page.drawText("DESTINATARIO:", { x: 20, y: height - 160, font, size: 9, color: rgb(0.4, 0.4, 0.4) });
        page.drawText(`${receiverAddress.receiver_name || 'Nombre no disponible'}`, { x: 20, y: height - 175, font: fontBold, size: 12 });
        page.drawText(`${receiverAddress.address_line || 'Dirección no disponible'}`, { x: 20, y: height - 190, font, size: 10 });
        page.drawText(`${receiverAddress.zip_code || ''} ${receiverAddress.city?.name || ''}`, { x: 20, y: height - 205, font, size: 10 });
        page.drawRectangle({ x: 15, y: height - 220, width: width - 30, height: 1, color: rgb(0.8, 0.8, 0.8) });

        // --- SECCIÓN 4: ITEMS Y MARCA DE STOCK ---
        let yPosition = height - 240;
        for (const item of orderData.order_items) {
            const { data: product } = await supabase.from('products').select('stock_disponible').eq('sku', item.sku).single();
            const hasStock = product && product.stock_disponible >= item.quantity;
            const stockIndicator = hasStock ? "[EN STOCK]" : "[PEDIR]";
            page.drawText(`${item.quantity}x ${item.sku || 'SKU no encontrado'}`, { x: 20, y: yPosition, font: fontBold, size: 10 });
            page.drawText(stockIndicator, { x: width - 70, y: yPosition, font: fontBold, size: 10, color: hasStock ? rgb(0, 0.5, 0) : rgb(0.8, 0, 0) });
            yPosition -= 12;
        }

        const pdfBytes = await pdfDoc.save();
        return new Response(pdfBytes, { headers: { ...corsHeaders, 'Content-Type': 'application/pdf' } });
    }
    return new Response(JSON.stringify({ message: "Formato no soportado." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error en generate-shipping-label:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});