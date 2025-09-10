export const LS_KEY_EXTRA = "xauusd_ohlc_extra_v1";

export function mapByDate(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = r.date.toISOString().slice(0, 10);
    m.set(k, r);
  }
  return m;
}

export function rowsFromMap(m) {
  return Array.from(m.values()).sort((a, b) => +a.date - +b.date);
}

export function loadExtraFromLS() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY_EXTRA);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return arr
      .map((r) => ({ ...r, date: new Date(r.date) }))
      .filter((r) => r?.date && !Number.isNaN(+r.date))
      .sort((a, b) => +a.date - +b.date);
  } catch {
    return [];
  }
}

export function saveExtraToLS(rows) {
  if (typeof window === "undefined") return;
  try {
    const out = rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) }));
    window.localStorage.setItem(LS_KEY_EXTRA, JSON.stringify(out));
  } catch {}
}
