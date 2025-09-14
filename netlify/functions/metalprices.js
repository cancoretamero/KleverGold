// netlify/functions/metalprices.js
// Proxy simplificado: llama directamente al endpoint válido de Metals‑API.
// Requiere: METALS_API_KEY en Functions.
// Respuesta: { ok:true, rows:[{date,open,high,low,close}] }

const H = {
  json: (status, data) => ({
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(data),
  }),
  cors204: () => ({
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
    }),
  }),
};

const API_KEY = process.env.METALS_API_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return H.cors204();
  if (event.httpMethod !== "GET") return H.json(405, { ok:false, error:"Method Not Allowed" });

  try {
    if (!API_KEY) {
      return H.json(500, { ok:false, error:"Falta METALS_API_KEY en Functions env" });
    }

    // Parámetros de la solicitud
    const p = new URLSearchParams(event.queryStringParameters || {});
    const from = String(p.get("from") || "").slice(0,10);
    const to   = String(p.get("to")   || "").slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return H.json(400, { ok:false, error:"Parámetros inválidos: from/to deben ser YYYY-MM-DD" });
    }

    // Construye URL directamente al endpoint v1 de Metals-API (USD como base, XAU como símbolo)
    const url = new URL("https://metals-api.com/api/v1/timeseries");
    url.searchParams.set("start_date", from);
    url.searchParams.set("end_date", to);
    url.searchParams.set("base", "USD");
    url.searchParams.set("symbols", "XAU");
    url.searchParams.set("access_key", API_KEY);

    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || data.success !== true || !data.rates) {
      return H.json(502, { ok:false, error:"Proveedor respondió sin datos", raw: data });
    }

    // Normaliza a OHLC: Metals-API devuelve para cada fecha USD y XAU; invertimos USD/XAU para obtener XAU/USD
    const rows = [];
    const rates = data.rates;
    for (const [date, currencies] of Object.entries(rates)) {
      const usdPerXau = currencies && currencies["XAU"];
      // usdPerXau = USD per 1 XAU, invertimos para precio en USD?
      // Según Metals-API, "base=USD&symbols=XAU" da XAU por 1 USD, así que invertimos:
      const price = usdPerXau && Number(usdPerXau) > 0 ? 1 / Number(usdPerXau) : NaN;
      if (Number.isFinite(price)) {
        rows.push({ date, open: price, high: price, low: price, close: price });
      }
    }
    if (!rows.length) {
      return H.json(502, { ok:false, error:"Datos vacíos de Metals-API", raw: data });
    }

    return H.json(200, { ok:true, rows });
  } catch (e) {
    return H.json(500, { ok:false, error:String(e?.message || e) });
  }
};
