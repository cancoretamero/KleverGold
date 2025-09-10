import { CONFIG } from './config.js'
import { parseNumber, toDate, sanitizeOhlc } from './utils.js'

export async function fetchOhlcDayFromMetals(dateISO) {
  if (!CONFIG.API_KEY) throw new Error("Falta API key (define VITE_METALS_API_KEY o window.METALS_API_KEY)");
  const url = new URL(`${CONFIG.API_BASE}/ohlc`);
  url.searchParams.set("access_key", CONFIG.API_KEY);
  url.searchParams.set("symbol", CONFIG.SYMBOL);
  url.searchParams.set("date", dateISO);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error?.message || "API error");

  const payload = json.ohlc || json.data || json;
  const open = parseNumber(payload.open);
  const high = parseNumber(payload.high);
  const low = parseNumber(payload.low);
  const close = parseNumber(payload.close);
  if (![open, high, low, close].every(Number.isFinite)) {
    throw new Error("Respuesta API sin OHLC válido");
  }
  const dt = toDate(dateISO);
  return sanitizeOhlc({ date: dt, open, high, low, close, year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1 });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      await sleep(CONFIG.REQUEST_DELAY_MS);
    }
  }
  return out;
}
