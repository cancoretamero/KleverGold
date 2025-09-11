// src/api.js
export async function persistRowsToRepo(rowsNew) {
  try {
    const resp = await fetch('/.netlify/functions/update-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rowsNew),
    });
    return await resp.json();
  } catch (e) {
    console.warn('persistRowsToRepo failed', e);
    return { ok:false, error:e.message };
  }
}

// (opcional) intentar TIMESERIES para reducir calls; fallback día-a-día:
export async function fetchMissingDaysOptimized(daysISO) {
  try {
    const ranges = toRanges(daysISO); // agrupa días contiguos
    const out = [];
    for (const [start, end] of ranges) {
      // intenta timeseries si tu Metals API lo soporta:
      const got = await tryTimeseries(start, end);
      if (got?.length) { out.push(...got); continue; }
      // fallback: día a día (reutiliza tu función)
      for (let d of enumerate(start, end)) {
        try { out.push(await fetchOhlcDayFromMetals(d)); } catch {}
        await sleep(1100);
      }
    }
    return out;
  } catch (e) {
    console.warn('fetchMissingDaysOptimized error -> fallback sequential', e);
    // último fallback: usa tu secuencial existente
    return await fetchMissingDaysSequential(daysISO);
  }
}

// helpers para ranges/timeseries (ajusta endpoint exacto de tu Metals API)
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
    // ¡OJO!: ajusta al endpoint real de tu Metals API
    const url = new URL(`${CONFIG.API_BASE}/timeseries`);
    url.searchParams.set('access_key', CONFIG.API_KEY);
    url.searchParams.set('symbol', CONFIG.SYMBOL || 'XAUUSD');
    url.searchParams.set('start_date', startISO);
    url.searchParams.set('end_date', endISO);
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    // Normaliza al formato de tu CSV (open, high, low, close)
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
  } catch { return null; }
}
function num(x){ const n=Number(x); return Number.isFinite(n)? n : NaN; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
