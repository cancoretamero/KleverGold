// src/api.js — usa Functions (no expone claves)
// - GET rangos faltantes vía /.netlify/functions/metalprices
// - POST guardado CSV vía /.netlify/functions/update-csv

export async function fetchMissingDaysSequential(dates, symbol = "XAUUSD") {
  const sorted = Array.from(new Set(dates)).sort();
  const chunks = packIntoRanges(sorted);
  const all = [];
  for (const [from, to] of chunks) {
    const rows = await getRangeFromServer(from, to, symbol);
    all.push(...rows);
  }
  return dedupeByDate(all);
}

export async function fetchMissingDaysOptimized(dates, symbol = "XAUUSD") {
  const sorted = Array.from(new Set(dates)).sort();
  const chunks = packIntoRanges(sorted);
  const parts = await Promise.all(chunks.map(([from, to]) => getRangeFromServer(from, to, symbol)));
  return dedupeByDate(parts.flat());
}

export async function persistRowsToRepo(rows) {
  if (!rows || !rows.length) return { ok: true, added: 0 };
  const res = await fetch("/.netlify/functions/update-csv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rows.map((r) => ({
      date: (r.date instanceof Date ? r.date : new Date(r.date)).toISOString().slice(0,10),
      open: num(r.open), high: num(r.high), low: num(r.low), close: num(r.close)
    }))),
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>"");
    throw new Error("update-csv fallo: " + res.status + " " + text);
  }
  return await res.json();
}

// ===== Helpers =====
function packIntoRanges(dates) {
  if (!dates.length) return [];
  const toDate = (s) => new Date(s + "T00:00:00Z");
  const addDay = (d) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + 1); return x; };
  const fmt = (d) => d.toISOString().slice(0,10);

  const ranges = [];
  let start = toDate(dates[0]);
  let prev = toDate(dates[0]);
  for (let i=1; i<dates.length; i++) {
    const cur = toDate(dates[i]);
    if (+cur - +addDay(prev) > 0) {
      ranges.push([fmt(start), fmt(prev)]);
      start = cur;
    }
    prev = cur;
  }
  ranges.push([fmt(start), fmt(prev)]);
  return ranges;
}

async function getRangeFromServer(from, to, symbol) {
  const url = new URL("/.netlify/functions/metalprices", window.location.origin);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("symbol", symbol);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.ok) {
    throw new Error("metalprices proxy fallo: " + (j?.error || res.status));
  }
  return (j.rows || []).map((r) => {
    const d = new Date(String(r.date).slice(0,10) + "T00:00:00Z");
    const open  = num(r.open), high = num(r.high), low = num(r.low), close = num(r.close);
    return {
      date: d, open, high, low, close,
      range: Math.abs(high - low),
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
    };
  });
}

function dedupeByDate(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = (r.date instanceof Date) ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10);
    m.set(k, r);
  }
  return Array.from(m.values()).sort((a,b) => +a.date - +b.date);
}

function num(x){ const n = Number(String(x ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; }
