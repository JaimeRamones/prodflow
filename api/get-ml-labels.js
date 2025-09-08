// api/get-ml-labels.js
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

async function getMeliToken(supabase, userId) {
  const { data: creds, error } = await supabase.from("meli_credentials").select("access_token, refresh_token, last_updated").eq("user_id", userId).single();
  if (error || !creds) throw new Error("Credenciales no encontradas en Supabase.");
  
  const tokenAge = (new Date().getTime() - new Date(creds.last_updated).getTime()) / 1000;
  if (tokenAge < 21600) return creds.access_token;

  const MELI_CLIENT_ID = process.env.MELI_CLIENT_ID;
  const MELI_CLIENT_SECRET = process.env.MELI_CLIENT_SECRET;

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: MELI_CLIENT_ID, client_secret: MELI_CLIENT_SECRET, refresh_token: creds.refresh_token }),
  });

  if (!response.ok) throw new Error("Error al refrescar token de ML.");
  const tokenData = await response.json();
  await supabase.from("meli_credentials").update({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, last_updated: new Date().toISOString() }).eq("user_id", userId);
  return tokenData.access_token;
}

module.exports = async (req, res) => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: req.headers.authorization } }
    });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado.");

    const { shipment_ids, format } = req.body;
    if (!shipment_ids || !format) throw new Error("Faltan parámetros.");

    const accessToken = await getMeliToken(supabase, user.id);
    
    const url = `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipment_ids}&response_type=${format === 'pdf' ? 'pdf' : 'zpl2'}`;

    const meliResponse = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!meliResponse.ok) {
        const errorText = await meliResponse.text();
        throw new Error(`Error de la API de ML: ${errorText}`);
    }

    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'text/plain');
    meliResponse.body.pipe(res);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};