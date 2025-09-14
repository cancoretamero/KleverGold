// netlify/functions/metalprices.js
// Proxy seguro hacia tu proveedor "MetalPrices": la API KEY vive en Functions (no en el frontend).
// Params admitidos (query): from=YYYY-MM-DD, to=YYYY-MM-DD, symbol=XAUUSD
// Respuesta: { ok:true, rows:[{date, open, high, low, close}], provider, tried: [...] }

const H = {
  json: (status, data) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) }),
  cors204: () => ({ statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,OPTIONS' }, body: '' }),
};

const API_BASE = process.env.API_BASE;           // e.g. https://api.metalprices.com/v1
const API_KEY  = process.env.METALS_API_KEY;     // tu clave secreta
const PROVIDER = process.env.API_PROVIDER || "metalprices";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return H.cors204();
  if (event.httpMethod !== 'GET') return H.json(405, { ok:false, error:'Method Not Allowed' });

  try {
    if (!API_BASE || !API_KEY) {
      return H.json(500, { ok:false, error:'Faltan API_BASE o METALS_API_KEY en Functions env' });
    }

    const params = new URLSearchParams(event.queryStringParameters || {});
    const from = String(params.get('from') || '').slice(0,10);
    const to   = String(params.get('to')   || '').slice(0,10);
    const symbol = (params.get('symbol') || 'XAUUSD').toUpperCase();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return H.json(400, { ok:false, error:'Parámetros inválidos: from/to deben ser YYYY-MM-DD' });
    }

    // Candidatos de endpoints comunes para timeseries (probamos varios)
    const u = (path, q) => {
      const url = new URL(path.replace(/\/+$/,'').startsWith('http') ? path : API_BASE.replace(/\/$/,'') + '/' + path.replace(/^\//,''));
      for (const [k,v] of Object.entries(q || {})) url.searchParams.set(k, v);
      // Incluimos varias convenciones de apikey por compatibilidad
      url.searchParams.set('apikey', API_KEY);
      url.searchParams.set('api_key', API_KEY);
      url.searchParams.set('access_key', API_KEY);
      return url.toString();
    };

    const candidates = [
      u('/timeseries', { symbol, start: from, end: to }),
      u('/timeseries', { symbol, start_date: from, end_date: to }),
      u('/historical', { symbol, date_from: from, date_to: to }),
      u('/history',    { symbol, from, to }),
      u('/daily',      { symbol, from, to }),
    ];

    const tried = [];
    let json = null, okUrl = null;
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'klevergold/metalprices-proxy',
            'x-api-key': API_KEY,
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json'
          },
        });
        const text = await res.text();
        tried.push({ url, status: res.status, bytes: text.length });
        if (!res.ok) continue;
        json = JSON.parse(text);
        okUrl = url;
        break;
      } catch (e) {
        tried.push({ url, error: String(e) });
        await sleep(120);
      }
    }

    if (!json) {
      return H.json(502, { ok:false, error:'No se pudo obtener la serie del proveedor', tried });
    }

    // Normalizamos a filas OHLC
    const rows = normalizeToOHLC(json, symbol);
    if (!rows || !rows.length) {
      return H.json(502, { ok:false, error:'Proveedor respondió sin datos OHLC interpretables', sample: json?.slice?.(0,1) || json, tried });
    }

    return H.json(200, { ok:true, provider: PROVIDER, used: okUrl, rows, tried });
  } catch (e) {
    return H.json(500, { ok:false, error: String(e?.message || e) });
  }
};

// Heurística de normalización
function normalizeToOHLC(payload, symbol) {
  // Caso 1: [{date, open, high, low, close}]
  if (Array.isArray(payload) && payload.length && typeof payload[0] === 'object') {
    const a = payload.map(r => ({
      date: (r.date || r.day || r.timestamp || '').toString().slice(0,10),
      open: num(r.open ?? r.o ?? r.price ?? r.close),
      high: num(r.high ?? r.h ?? r.price ?? r.close),
      low:  num(r.low  ?? r.l ?? r.price ?? r.close),
      close:num(r.close?? r.c ?? r.price ),
    })).filter(v => v.date && isFinite(v.open) && isFinite(v.high) && isFinite(v.low) && isFinite(v.close));
    return a;
  }

  // Caso 2: { data: [...] }
  if (payload && Array.isArray(payload.data)) return normalizeToOHLC(payload.data, symbol);

  // Caso 3: { rates: { "YYYY-MM-DD": { open, high, low, close } | price } }
  if (payload && payload.rates && typeof payload.rates === 'object') {
    const out = [];
    for (const [d, v] of Object.entries(payload.rates)) {
      if (v && typeof v === 'object') {
        const o = num(v.open ?? v.o ?? v.price ?? v.close);
        const h = num(v.high ?? v.h ?? v.price ?? v.close);
        const l = num(v.low  ?? v.l ?? v.price ?? v.close);
        const c = num(v.close?? v.c ?? v.price ?? o);
        if (d && isFinite(o) && isFinite(h) && isFinite(l) && isFinite(c)) out.push({ date: d.slice(0,10), open:o, high:h, low:l, close:c });
      } else {
        const p = num(v);
        if (isFinite(p)) out.push({ date: d.slice(0,10), open:p, high:p, low:p, close:p });
      }
    }
    return out.sort((a,b) => a.date.localeCompare(b.date));
  }

  return [];
}

function num(x) {
  if (x == null) return NaN;
  const n = Number(String(x).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
