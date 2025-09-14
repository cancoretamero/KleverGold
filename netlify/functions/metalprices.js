// netlify/functions/metalprices.js
// Proxy hacia Metals‑API. Permite obtener series históricas (OHLC) y respeta los
// límites de fechas de la API. Requiere METALS_API_KEY en el entorno (y opcionalmente API_BASE).

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
    },
    body: "",
  }),
};

const API_KEY  = process.env.METALS_API_KEY;
const API_BASE = process.env.API_BASE || "https://metals-api.com/api";

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") return H.cors204();
  if (event.httpMethod !== "GET") {
    return H.json(405, { ok: false, error: "Method Not Allowed" });
  }

  try {
    if (!API_KEY) {
      return H.json(500, { ok: false, error: "Falta METALS_API_KEY en variables Functions" });
    }

    // Leer parámetros
    const params = new URLSearchParams(event.queryStringParameters || {});
    let from = String(params.get("from") || "").slice(0, 10);
    let to   = String(params.get("to")   || "").slice(0, 10);
    const symbolParam = String(params.get("symbol") || "XAUUSD").trim().toUpperCase();

    // Si las fechas no cumplen YYYY-MM-DD, usamos ayer como único día
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const todayIso = new Date().toISOString().slice(0, 10);
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      from = to = d.toISOString().slice(0, 10);
    }

    // Corrige 'to' para que no sea hoy ni posterior
    if (to >= todayIso) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      to = d.toISOString().slice(0, 10);
    }
    // Nuevo: si 'from' es posterior a 'to', igualarlo a 'to'
    if (from > to) {
      from = to;
    }

    // Extraer metal y base de symbol (ej. XAUUSD -> metal=XAU, base=USD)
    let metal = "XAU";
    let base  = "USD";
    if (/^[A-Z]{6,7}$/.test(symbolParam)) {
      base  = symbolParam.slice(-3);
      metal = symbolParam.slice(0, symbolParam.length - 3);
    }

    // Construir URL del endpoint timeseries
    const url = new URL(`${API_BASE.replace(/\\/+$|\\/$/g, "")}/timeseries`);
    url.searchParams.set("start_date", from);
    url.searchParams.set("end_date", to);
    url.searchParams.set("base", base);
    url.searchParams.set("symbols", metal);
    url.searchParams.set("access_key", API_KEY);

    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success !== true || !data.rates) {
      return H.json(502, { ok: false, error: "Proveedor respondió sin datos", raw: data });
    }

    // Normalizar a filas OHLC (todos los campos iguales al precio)
    const rows = [];
    for (const [dateStr, currencies] of Object.entries(data.rates)) {
      const rate = currencies && currencies[metal];
      let price;
      if (Number(rate) > 0) {
        // Para oro con base USD la API devuelve XAU por USD (invertir)
        price = base === "USD" && metal === "XAU"
          ? 1 / Number(rate)
          : Number(rate);
      } else {
        price = NaN;
      }
      if (Number.isFinite(price)) {
        rows.push({ date: dateStr, open: price, high: price, low: price, close: price });
      }
    }

    if (!rows.length) {
      return H.json(502, { ok: false, error: "Datos vacíos de Metals‑API", raw: data });
    }

    return H.json(200, { ok: true, rows });
  } catch (e) {
    return H.json(500, { ok: false, error: String(e?.message || e) });
  }
};
