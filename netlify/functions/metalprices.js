// netlify/functions/metalprices.js
// Proxy hacia Metals‑API. Sirve tanto para obtener series históricas (OHLC)
// como el último precio disponible. Necesita METALS_API_KEY en variables Functions
// y opcionalmente API_BASE para cambiar la URL base del proveedor.

// Helpers de respuesta y CORS
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

// Claves y configuración
const API_KEY  = process.env.METALS_API_KEY;
const API_BASE = process.env.API_BASE || "https://metals-api.com/api";

exports.handler = async (event) => {
  // Manejo de OPTIONS
  if (event.httpMethod === "OPTIONS") return H.cors204();
  if (event.httpMethod !== "GET") {
    return H.json(405, { ok: false, error: "Method Not Allowed" });
  }

  try {
    if (!API_KEY) {
      return H.json(500, { ok: false, error: "Falta METALS_API_KEY en variables Functions" });
    }

    // Extraer parámetros del query string
    const params = new URLSearchParams(event.queryStringParameters || {});
    let from = String(params.get("from") || "").slice(0, 10);
    let to   = String(params.get("to")   || "").slice(0, 10);
    const symbolParam = String(params.get("symbol") || "XAUUSD").trim().toUpperCase();

    // Validar fechas (YYYY-MM-DD). Si no se indican, usaremos el último día disponible
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const todayIso = new Date().toISOString().slice(0, 10);
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      // Si no pasan fechas válidas, calculamos ayer para obtener el último precio
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      from = to = d.toISOString().slice(0, 10);
    }

    // Asegurar que "to" no es hoy ni posterior (Metals‑API no lo permite en timeseries)
    if (to >= todayIso) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      to = d.toISOString().slice(0, 10);
    }

    // Extraer metal y base a partir de symbol (ej. XAUUSD -> metal=XAU, base=USD)
    let metal = "XAU";
    let base  = "USD";
    if (/^[A-Z]{6,7}$/.test(symbolParam)) {
      base  = symbolParam.slice(-3);
      metal = symbolParam.slice(0, symbolParam.length - 3);
    }

    // Construir URL del endpoint timeseries de Metals‑API
    const url = new URL(`${API_BASE.replace(/\\/+$|\\/$/g, "")}/timeseries`);
    url.searchParams.set("start_date", from);
    url.searchParams.set("end_date", to);
    url.searchParams.set("base", base);
    url.searchParams.set("symbols", metal);
    url.searchParams.set("access_key", API_KEY);

    // Llamar al proveedor
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => null);

    // Validación de respuesta
    if (!response.ok || !data || data.success !== true || !data.rates) {
      return H.json(502, { ok: false, error: "Proveedor respondió sin datos", raw: data });
    }

    // Convertir tasas en filas OHLC (open=high=low=close)
    const rows = [];
    for (const [dateStr, currencies] of Object.entries(data.rates)) {
      const rate = currencies && currencies[metal];
      let price;
      if (Number(rate) > 0) {
        // Para oro con base USD, hay que invertir la tasa (USD/XAU)
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

    // Respuesta exitosa
    return H.json(200, { ok: true, rows });
  } catch (e) {
    return H.json(500, { ok: false, error: String(e?.message || e) });
  }
};
