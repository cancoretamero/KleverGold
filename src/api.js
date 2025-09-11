// src/api.js
import { CONFIG } from './config.js';

// --------- Parse helpers ----------
function toDate(d){ try { return (d instanceof Date) ? d : new Date(d); } catch { return new Date(); } }
function num(x){ const n = Number(x); return Number.isFinite(n) ? n : NaN; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

// --------- Metals API: día a día ----------
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
  const open = num(payload.open);
  const high = num(payload.high);
  const low = num(payload.low);
  const close = num(payload.close);
  if (![open, high, low, close].every(Number.isFinite)) {
    throw new Error("Respuesta API sin OHLC válido");
  }
  const dt = toDate(dateISO);
  return {
    date: dt, open, high, low, close,
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    range: high - low
  };
}

export async function fetchMissingDaysSequential(daysISO) {
  const out = [];
  for (let i = 0; i < daysISO.length; i++) {
    const d = daysISO[i];
    try {
      const row = await fetchOhlcDayFromMetals(d);
      out.push(row);
    } catch (e) {
      console.warn("Fallo obteniendo", d, e);
    }
    if (i < daysISO.length - 1 && CONFIG.REQUEST_DELAY_MS > 0) {
      await sleep(CONFIG.REQUEST_DELAY_MS || 1100);
    }
  }
  return out;
}

// --------- Netlify Function: persistir al repo (CSV) ----------
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

// --------- Optimización de huecos: intenta timeseries y agrupa ---------
export async function fetchMissingDaysOptimized(daysISO) {
  try {
    const ranges = toRanges(daysISO); // agrupa contiguos
    const out = [];
    for (const [start, end] of ranges) {
      const tsRows = await tryTimeseries(start, end); // 1 llamada por rango si existe endpoint
      if (tsRows?.length) { out.push(...tsRows); continue; }
      // fallback secuencial (respeta throttle)
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
    // Ajusta si tu Metals API usa otra ruta/shape para timeseries
    const url = new URL(`${CONFIG.API_BASE}/timeseries`);
    url.searchParams.set('access_key', CONFIG.API_KEY);
    url.searchParams.set('symbol', CONFIG.SYMBOL || 'XAUUSD');
    url.searchParams.set('start_date', startISO);
    url.searchParams.set('end_date', endISO);

    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();

    const rows = [];
    const data = j?.ohlc || j?.rates || j?.data || j;
    for (const [date, v] of Object.entries(data)) {
      const open  = num(v.open), high=num(v.high), low=num(v.low), close=num(v.close);
      if ([open,high,low,close].every(Number.isFinite)) {
        const dt = new Date(date+'T00:00:00Z');
        rows.push({ date: dt, open, high, low, close, year: dt.getUTCFullYear(), month: dt.getUTCMonth()+1, range: high-low });
      }
    }
    return rows.sort((a,b)=> +a.date - +b.date);
  } catch {
    return null; // sin timeseries o error → que use secuencial
  }
}
