// src/api.js
import { CONFIG } from './config.js';

// ---------- helpers comunes ----------
function toDate(d){ try { return (d instanceof Date) ? d : new Date(d); } catch { return new Date(); } }
function num(x){ const n = Number(x); return Number.isFinite(n) ? n : NaN; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// ---------- OHLC día a día (ya lo usabas) ----------
export async function fetchOhlcDayFromMetals(dateISO) {
  if (!CONFIG.API_KEY) throw new Error("Falta API key (define NEXT_PUBLIC_METALS_API_KEY / VITE_METALS_API_KEY o window.METALS_API_KEY)");
  const url = new URL(`${CONFIG.API_BASE}/ohlc`);
  url.searchParams.set("access_key", CONFIG.API_KEY);
  url.searchParams.set("symbol", CONFIG.SYMBOL || "XAUUSD");
  url.searchParams.set("date", dateISO);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error?.message || "API error");

  const payload = json.ohlc || json.data || json;
  const open = num(payload.open), high = num(payload.high), low = num(payload.low), close = num(payload.close);
  if (![open, high, low, close].every(Number.isFinite)) throw new Error("Respuesta API sin OHLC válido");

  const dt = toDate(dateISO);
  return { date: dt, open, high, low, close, year: dt.getUTCFullYear(), month: dt.getUTCMonth()+1, range: high - low };
}

export async function fetchMissingDaysSequential(daysISO) {
  const out = [];
  for (let i = 0; i < daysISO.length; i++) {
    const d = daysISO[i];
    try { out.push(await fetchOhlcDayFromMetals(d)); } catch (e) { console.warn("Fallo obteniendo", d, e); }
    if (i < daysISO.length - 1 && (CONFIG.REQUEST_DELAY_MS ?? 1100) > 0) {
      await sleep(CONFIG.REQUEST_DELAY_MS ?? 1100);
    }
  }
  return out;
}

// ---------- Persistencia en repo (Netlify Function) ----------
export async function persistRowsToRepo(rowsNew) {
  try {
    const resp = await fetch('/.netlify/functions/update-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rowsNew.map(r => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10),
        open: r.open, high: r.high, low: r.low, close: r.close
      }))),
    });
    return await resp.json();
  } catch (e) {
    console.warn('persistRowsToRepo failed', e);
    return { ok:false, error:e.message };
  }
}

// ---------- Optimización huecos (ranges + timeseries si existe) ----------
export async function fetchMissingDaysOptimized(daysISO) {
  try {
    const ranges = toRanges(daysISO);
    const out = [];
    for (const [start, end] of ranges) {
      const tsRows = await tryTimeseries(start, end);
      if (tsRows?.length) { out.push(...tsRows); continue; }
      const eachRows = await fetchMissingDaysSequential(enumerate(start, end));
      out.push(...eachRows);
    }
    return out.sort((a,b)=> +a.date - +b.date);
  } catch (e) {
    console.warn('fetchMissingDaysOptimized error -> fallback sequential', e);
    return await fetchMissingDaysSequential(daysISO);
  }
}

function toRanges(days) {
  if (!days?.length) return [];
  const sorted = [...days].sort();
  const out = []; let a = sorted[0], b = sorted[0];
  for (let i=1;i<sorted.length;i++){
    const d = sorted[i];
    if (nextDay(b) === d) { b = d; } else { out.push([a,b]); a=b=d; }
  }
  out.push([a,b]);
  return out;
}
function nextDay(iso){ const dt=new Date(iso); dt.setUTCDate(dt.getUTCDate()+1); return dt.toISOString().slice(0,10); }
function enumerate(a,b){ const out=[]; let d=new Date(a); const end=new Date(b); while(d<=end){ out.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+1);} return out; }

async function tryTimeseries(startISO, endISO){
  try {
    const url = new URL(`${CONFIG.API_BASE}/timeseries`);
    url.searchParams.set('access_key', CONFIG.API_KEY);
    url.searchParams.set('symbol', CONFIG.SYMBOL || 'XAUUSD');
    url.searchParams.set('start_date', startISO);
    url.searchParams.set('end_date', endISO);
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const data = j?.ohlc || j?.rates || j?.data || j;
    const rows = [];
    for (const [date, v] of Object.entries(data)) {
      const open=num(v.open), high=num(v.high), low=num(v.low), close=num(v.close);
      if ([open,high,low,close].every(Number.isFinite)) {
        const dt = new Date(date+'T00:00:00Z');
        rows.push({ date: dt, open, high, low, close, year: dt.getUTCFullYear(), month: dt.getUTCMonth()+1, range: high-low });
      }
    }
    return rows.sort((a,b)=> +a.date - +b.date);
  } catch { return null; }
}

// ---------- NUEVO: precio spot (/latest) para el encabezado ----------
export async function fetchSpotLatest() {
  if (!CONFIG.API_KEY) throw new Error("Falta API key para /latest");
  const url = new URL(`${CONFIG.API_BASE}/latest`);
  url.searchParams.set('access_key', CONFIG.API_KEY);
  // Algunas APIs usan 'symbols', otras 'symbol'. Probamos ambos.
  url.searchParams.set('symbols', CONFIG.SYMBOL || 'XAUUSD');
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();

  // Estructuras posibles: { rates: {XAUUSD: 2365.1}, timestamp }
  // o { rate: 2365.1, symbol: "XAUUSD", date: "..." }
  let price = null, ts = Date.now();
  if (j?.rates && typeof j.rates === 'object') {
    const key = Object.keys(j.rates)[0];
    price = num(j.rates[key]);
  } else if (num(j?.rate)) {
    price = num(j.rate);
  } else if (num(j?.price)) {
    price = num(j.price);
  }
  if (j?.timestamp) ts = j.timestamp*1000;
  else if (j?.date) { const d = Date.parse(j.date); if (!Number.isNaN(d)) ts = d; }

  if (!Number.isFinite(price)) throw new Error('Spot sin precio válido');
  return { price, ts };
}
