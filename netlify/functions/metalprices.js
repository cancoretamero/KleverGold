// netlify/functions/metalprices.js
// Proxy seguro hacia tu proveedor Metals‑API.
// Lee ENV (Functions): API_BASE, METALS_API_KEY, API_TEMPLATE (opcional) y API_STYLE (opcional)
// Respuesta: { ok:true, rows:[{date,open,high,low,close}], used, tried }

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

const API_BASE     = process.env.API_BASE;
const API_KEY      = process.env.METALS_API_KEY;
const API_TEMPLATE = process.env.API_TEMPLATE || "";
const API_STYLE    = (process.env.API_STYLE || "").toLowerCase();

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return H.cors204();
  if (event.httpMethod !== "GET") return H.json(405, { ok:false, error:"Method Not Allowed" });

  try {
    if (!API_BASE || !API_KEY) {
      return H.json(500, { ok:false, error:"Faltan API_BASE o METALS_API_KEY en Functions env" });
    }

    // Parámetros de la solicitud
    const p = new URLSearchParams(event.queryStringParameters || {});
    const from = String(p.get("from") || "").slice(0,10);
    const to   = String(p.get("to")   || "").slice(0,10);
    const sym  = (p.get("symbol") || "XAUUSD").toUpperCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return H.json(400, { ok:false, error:"Parámetros inválidos: from/to deben ser YYYY-MM-DD" });
    }

    const { base, quote, symbol } = splitSymbol(sym);

    // Intentos
    const tried = [];
    let json = null, used = null;

    // Si hay plantilla explícita, usarla primero
    if (API_TEMPLATE.trim()) {
      const url = buildFromTemplate(API_BASE, API_TEMPLATE, { from, to, base, quote, symbol, apikey: API_KEY });
      const r = await tryFetch(url, tried);
      if (r.ok && r.json) { json = r.json; used = url; }
    }

    // Si aún no hay JSON, probamos con varios estilos típicos
    if (!json) {
      const candidates = buildCandidates(API_BASE, { from, to, base, quote, symbol, apikey: API_KEY }, API_STYLE);
      for (const url of candidates) {
        const r = await tryFetch(url, tried);
        if (r.ok && r.json) { json = r.json; used = url; break; }
      }
    }

    if (!json) return H.json(502, { ok:false, error:"No se pudo obtener la serie del proveedor", tried });

    const rows = normalizeToOHLC(json, { base, quote, symbol });
    if (!rows || !rows.length) {
      return H.json(502, { ok:false, error:"Proveedor respondió sin datos OHLC interpretables", tried });
    }

    return H.json(200, { ok:true, used, rows, tried });
  } catch (e) {
    return H.json(500, { ok:false, error:String(e?.message || e) });
  }
};

// --- Funciones auxiliares ---

function splitSymbol(s) {
  let x = s.toUpperCase().replace(/[^A-Z/]/g, "");
  if (x.includes("/")) {
    const [a,b] = x.split("/");
    return { base:(a||"XAU"), quote:(b||"USD"), symbol:`${a||"XAU"}${b||"USD"}` };
  }
  if (x.length === 6) return { base:x.slice(0,3), quote:x.slice(3), symbol:x };
  return { base:"XAU", quote:"USD", symbol:"XAUUSD" };
}

function buildFromTemplate(base, tpl, vars) {
  const b = base.replace(/\/$/, "");
  const path = tpl.replace(/\{(from|to|base|quote|symbol|apikey)\}/g, (_, k) => encodeURIComponent(vars[k]));
  return path.startsWith("http") ? path : `${b}/${path.replace(/^\//,"")}`;
}

function buildCandidates(base, v, style) {
  const b = base.replace(/\/$/, "");
  const u = (path, q) => {
    const url = new URL(path.startsWith("http") ? path : `${b}/${path.replace(/^\//,"")}`);
    for (const [k,val] of Object.entries(q || {})) url.searchParams.set(k, val);
    url.searchParams.set("apikey", v.apikey);
    url.searchParams.set("api_key", v.apikey);
    url.searchParams.set("access_key", v.apikey);
    return url.toString();
  };

  const list = [];

  // Estilo específico para metals-api.com (metalsapi)
  if (style === "metalsapi") {
    list.push(u("/timeseries", { base: v.base, symbols: v.quote, start_date: v.from, end_date: v.to }));
  }

  // Genéricos
  list.push(u("/timeseries", { base: v.base, symbols: v.quote, start_date: v.from, end_date: v.to }));
  list.push(u("/historical", { symbol: v.symbol, date_from: v.from, date_to: v.to }));
  list.push(u("/history",    { symbol: v.symbol, from: v.from, to: v.to }));
  list.push(u("/daily",      { symbol: v.symbol, from: v.from, to: v.to }));

  return list;
}

async function tryFetch(url, tried) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "klevergold/metalprices-proxy",
        "x-api-key": API_KEY,
        "Authorization": `Bearer ${API_KEY}`,
        "Accept": "application/json",
      },
    });
    const text = await res.text();
    tried.push({ url, status: res.status, bytes: text.length });
    if (!res.ok) return { ok:false };
    let json = null; try { json = JSON.parse(text); } catch { return { ok:false }; }
    return { ok:true, json };
  } catch (e) {
    tried.push({ url, error: String(e) });
    return { ok:false };
  }
}

function normalizeToOHLC(payload) {
  // 1) array de objetos
  if (Array.isArray(payload) && payload.length && typeof payload[0] === "object") {
    const out = payload.map(r => ({
      date: (r.date || r.day || r.timestamp || "").toString().slice(0,10),
      open: num(r.open ?? r.o ?? r.price ?? r.close),
      high: num(r.high ?? r.h ?? r.price ?? r.close),
      low:  num(r.low  ?? r.l ?? r.price ?? r.close),
      close:num(r.close?? r.c ?? r.price),
    })).filter(v => v.date && isFinite(v.open) && isFinite(v.high) && isFinite(v.low) && isFinite(v.close));
    return out;
  }
  // 2) {data:[...]}
  if (payload && Array.isArray(payload.data)) return normalizeToOHLC(payload.data);
  // 3) {rates:{ "YYYY-MM-DD": {open,high,low,close} | number }}
  if (payload && payload.rates && typeof payload.rates === "object") {
    const out = [];
    for (const [d, v] of Object.entries(payload.rates)) {
      if (v && typeof v === "object") {
        const o = num(v.open ?? v.o ?? v.price ?? v.close);
        const h = num(v.high ?? v.h ?? v.price ?? v.close);
        const l = num(v.low  ?? v.l ?? v.price ?? v.close);
        const c = num(v.close?? v.c ?? v.price ?? o);
        if (d && isFinite(o) && isFinite(h) && isFinite(l) && isFinite(c)) out.push({ date:d.slice(0,10), open:o, high:h, low:l, close:c });
      } else {
        const p = num(v);
        if (isFinite(p)) out.push({ date:d.slice(0,10), open:p, high:p, low:p, close:p });
      }
    }
    return out.sort((a,b) => a.date.localeCompare(b.date));
  }
  return [];
}

function num(x){ const n = Number(String(x ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; }
