// netlify/functions/metalprices.js
// Proxy hacia Metals‑API. Obtiene series históricas llamando al endpoint
// {date} de forma individual cuando no se dispone del endpoint timeseries.
// Requiere METALS_API_KEY en el entorno (y opcionalmente API_BASE).

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
const API_BASE = process.env.API_BASE || 'https://metals-api.com/api';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return H.cors204();
  if (event.httpMethod !== 'GET') return H.json(405, { ok:false, error:'Method Not Allowed' });

  if (!API_KEY) return H.json(500, { ok:false, error:'Falta METALS_API_KEY en variables Functions' });

  const params = new URLSearchParams(event.queryStringParameters || {});
  let from = String(params.get('from') || '').slice(0,10);
  let to   = String(params.get('to')   || '').slice(0,10);
  const symbolParam = String(params.get('symbol') || 'XAUUSD').trim().toUpperCase();

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const todayIso  = new Date().toISOString().slice(0,10);
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    // Si falta alguna fecha, usa ayer para ambos
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    from = to = d.toISOString().slice(0,10);
  }
  // Ajustar 'to' para que no sea hoy ni posterior
  if (to >= todayIso) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    to = d.toISOString().slice(0,10);
  }
  // Si 'from' es posterior a 'to', corrígelo
  if (from > to) from = to;

  // Deduce metal y base a partir de symbol (ej. XAUUSD → XAU, USD)
  let metal = 'XAU';
  let base  = 'USD';
  if (/^[A-Z]{6,7}$/.test(symbolParam)) {
    base  = symbolParam.slice(-3);
    metal = symbolParam.slice(0, symbolParam.length - 3);
  }

  const rows = [];
  const startDate = new Date(from + 'T00:00:00Z');
  const endDate   = new Date(to   + 'T00:00:00Z');

  // Recorre cada fecha del rango y llama al endpoint histórico /YYYY-MM-DD
  for (let d = startDate; d <= endDate; d.setUTCDate(d.getUTCDate()+1)) {
    const isoDate = d.toISOString().slice(0,10);
    const histUrl = new URL(`${API_BASE.replace(/\\/+$|\\/$/g,'')}/${isoDate}`);
    histUrl.searchParams.set('access_key', API_KEY);
    histUrl.searchParams.set('base', base);
    histUrl.searchParams.set('symbols', metal);
    try {
      const resp = await fetch(histUrl.toString(), { headers: { Accept:'application/json' } });
      const j    = await resp.json().catch(()=>null);
      if (resp.ok && j && j.success !== false && j.rates && j.rates[metal]) {
        const rate = j.rates[metal];
        let price;
        // XAU por USD → invertir para obtener USD por XAU
        if (Number(rate) > 0) {
          price = (base === 'USD' && metal === 'XAU') ? 1/Number(rate) : Number(rate);
        }
        if (Number.isFinite(price)) {
          rows.push({ date: isoDate, open: price, high: price, low: price, close: price });
        }
      }
    } catch {
      // Ignoramos errores puntuales y pasamos a la siguiente fecha
    }
  }

  if (!rows.length) {
    return H.json(502, { ok:false, error:'Datos vacíos de Metals‑API' });
  }

  return H.json(200, { ok:true, rows });
};
