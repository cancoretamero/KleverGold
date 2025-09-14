// src/config.js — versión mínima SIN secretos en el frontend.
const win = (typeof window !== "undefined") ? window : {};
const env = (import.meta && import.meta.env) ? import.meta.env : {};

// Símbolo y CSV público (estos pueden ser públicos)
const SYMBOL = (win.SYMBOL ?? env.VITE_SYMBOL ?? "XAUUSD") || "XAUUSD";
const CSV_URL = (win.CSV_URL ?? env.VITE_CSV_URL ?? "/data/xauusd_ohlc_clean.csv") || "/data/xauusd_ohlc_clean.csv";
const REQUEST_DELAY_MS = Number(win.REQUEST_DELAY_MS ?? env.VITE_REQUEST_DELAY_MS ?? 1100) || 1100;

// NADA de API_KEY ni API_BASE aquí.
const CONFIG = { SYMBOL, CSV_URL, REQUEST_DELAY_MS };

export { CONFIG };
export default CONFIG;
if (win && !win.CONFIG) { try { win.CONFIG = CONFIG; } catch {} }
