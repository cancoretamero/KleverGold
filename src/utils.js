// -------- Utils (números, fechas, agregados, stats) --------
export function parseNumber(x) {
  if (typeof x === "number") return Number.isFinite(x) ? x : undefined;
  if (x == null) return undefined;
  let s = String(x).trim();
  if (!s) return undefined;
  s = s.replace(/[\u00A0\s'’]/g, "");
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  const toNum = (z) => {
    const n = Number(z);
    return Number.isFinite(n) ? n : undefined;
  };
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    const decChar = lastDot > lastComma ? "." : ",";
    const thouChar = decChar === "." ? "," : ".";
    s = s.split(thouChar).join("");
    s = s.replace(decChar, ".");
    return toNum(s);
  }
  if (hasComma) return toNum(s.replace(",", "."));
  if (hasDot) return toNum(s);
  return toNum(s);
}

// YYYY-MM-DD -> Date (UTC midnight)
export function toDate(d) {
  if (d instanceof Date) return Number.isNaN(+d) ? undefined : d;
  if (!d) return undefined;
  const s = String(d).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, da = parseInt(m[3], 10);
    const dt = new Date(Date.UTC(y, mo, da));
    return Number.isNaN(+dt) ? undefined : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(+dt) ? undefined : dt;
}

export function sanitizeOhlc(r) {
  const { open, high, low, close } = r;
  if (![open, high, low, close].every(Number.isFinite)) return null;
  const hi = Math.max(high, open, close);
  const lo = Math.min(low, open, close);
  return { ...r, high: hi, low: lo, range: hi - lo };
}

// Downsampling para velas
export function aggregateOhlc(rows, maxPoints = 3000) {
  if (!rows || rows.length <= maxPoints) return rows || [];
  const buckets = Math.min(maxPoints, rows.length);
  const out = [];
  const bucketSize = rows.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    const slice = rows.slice(start, Math.max(end, start + 1));
    const open = slice[0];
    const close = slice[slice.length - 1];
    let high = -Infinity, low = Infinity;
    for (const s of slice) {
      if (s.high > high) high = s.high;
      if (s.low < low) low = s.low;
    }
    out.push({ ...close, open: open.open, high, low, close: close.close });
  }
  return out;
}

export function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return NaN;
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedAsc[base + 1] !== undefined) {
    return sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]);
  } else {
    return sortedAsc[base];
  }
}

export function enumerateDays(startDate, endDate) {
  const out = [];
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    out.push(new Date(d));
  }
  return out;
}

// CSV loader util (URL)
import Papa from 'papaparse'
export async function loadCsvFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar CSV (${res.status})`);
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const rows = (parsed.data || [])
    .map((r) => {
      const date = toDate(r.date || r.Date || r.timestamp || r.time);
      const open = parseNumber(r.open ?? r.Open);
      const high = parseNumber(r.high ?? r.High);
      const low = parseNumber(r.low ?? r.Low);
      const close = parseNumber(r.close ?? r.Close);
      if (!date || open == null || high == null || low == null || close == null) return null;
      return sanitizeOhlc({ date, open, high, low, close, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
    })
    .filter(Boolean)
    .sort((a, b) => +a.date - +b.date);
  return rows;
}
