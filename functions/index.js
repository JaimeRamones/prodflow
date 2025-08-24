const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

const MELI_REDIRECT_URI = "https://us-central1-prodflow-d297d.cloudfunctions.net/mercadolibrecallback";
const MELI_CLIENT_ID = functions.config().mercadolibre.client_id;
const MELI_CLIENT_SECRET = functions.config().mercadolibre.client_secret;

exports.mercadolibreAuthorize = functions.https.onRequest((req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (!MELI_CLIENT_ID) {
      console.error("El Client ID de Mercado Libre no está configurado.");
      return res.status(500).send("Error de configuración del servidor. Falta el Client ID.");
  }
  const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${MELI_CLIENT_ID}&redirect_uri=${MELI_REDIRECT_URI}`;
  res.redirect(authUrl);
});

exports.mercadolibreCallback = functions.https.onRequest(async (req, res) => {
  const { code } = req.query;
  if (!code) { return res.status(400).send("No se recibió el código de autorización."); }
  try {
    const tokenResponse = await axios.post("https://api.mercadolibre.com/oauth/token", null, {
      params: {
        grant_type: "authorization_code",
        client_id: MELI_CLIENT_ID,
        client_secret: MELI_CLIENT_SECRET,
        code: code,
        redirect_uri: MELI_REDIRECT_URI,
      },
    });
    const { access_token, user_id } = tokenResponse.data;
    await db.collection("integrations").doc("mercadolibre").set({
      access_token: access_token,
      user_id: user_id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.send("<script>window.close();</script>");
  } catch (error) {
    console.error("Error en el callback de Mercado Libre:", error.response ? error.response.data : error.message);
    return res.status(500).send("Ocurrió un error al conectar con Mercado Libre.");
  }
});

exports.importMLProducts = functions.https.onCall(async (data, context) => {
    if (!context.auth) { throw new functions.https.HttpsError('unauthenticated', 'La función solo puede ser llamada por usuarios autenticados.'); }
    const integrationDoc = await db.collection("integrations").doc("mercadolibre").get();
    if (!integrationDoc.exists) { throw new functions.https.HttpsError("failed-precondition", "No se encontró la configuración de Mercado Libre."); }
    const { access_token, user_id } = integrationDoc.data();
    if (!access_token || !user_id) { throw new functions.https.HttpsError("failed-precondition", "El access token o el user ID no son válidos."); }
    try {
        const publicationsResponse = await axios.get(`https://api.mercadolibre.com/users/${user_id}/items/search`, { headers: { Authorization: `Bearer ${access_token}` } });
        const publicationIds = publicationsResponse.data.results || [];
        if (publicationIds.length === 0) { return { message: "No se encontraron publicaciones en Mercado Libre." }; }
        const itemsResponse = await axios.get(`https://api.mercadolibre.com/items`, { params: { ids: publicationIds.join(",") }, headers: { Authorization: `Bearer ${access_token}` } });
        const publications = itemsResponse.data;
        let importedCount = 0;
        const batch = db.batch();
        for (const item of publications) {
            if (item.code === 200 && item.body && item.body.attributes) {
                const sku = item.body.attributes.find((attr) => attr.id === "SELLER_SKU")?.value_name;
                if (sku) {
                    const productQuery = await db.collection("products").where("sku", "==", sku).limit(1).get();
                    if (productQuery.empty) {
                        const newProductData = { sku: sku, name: item.body.title, brand: "A definir", rubro: "A definir", supplierName: "A definir", costPrice: 0, salePrice: item.body.price, stockTotal: item.body.available_quantity, stockReservado: 0, stockDisponible: item.body.available_quantity, createdAt: admin.firestore.FieldValue.serverTimestamp() };
                        const newProductRef = db.collection("products").doc();
                        batch.set(newProductRef, newProductData);
                        importedCount++;
                    }
                }
            }
        }
        await batch.commit();
        if (importedCount > 0) { return { message: `${importedCount} nuevo(s) producto(s) importado(s) con éxito.` }; }
        else { return { message: "Todos los productos con SKU de Mercado Libre ya existen en ProdFlow." }; }
    } catch (error) {
        console.error("Error al importar productos de ML:", error.response ? error.response.data : error.message);
        throw new functions.https.HttpsError("internal", "Ocurrió un error al comunicarse con la API de Mercado Libre.");
    }
});