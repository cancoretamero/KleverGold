// /src/config.js  — versión limpia sin Epitome
const win = (typeof window !== "undefined") ? window : {};
const env = (import.meta && import.meta.env) ? import.meta.env : {};

// === Config de datos/CSV y API de metales ===
// Si NO rellenas API_BASE/API_KEY, el dashboard funciona solo con CSV.
const API_KEY = (win.METALS_API_KEY ?? env.VITE_METALS_API_KEY ?? "") || "";
const API_BASE = (win.API_BASE ?? env.VITE_API_BASE ?? "") || ""; // p.ej. "https://tu-proveedor.com/v1"
const SYMBOL = (win.SYMBOL ?? env.VITE_SYMBOL ?? "XAUUSD") || "XAUUSD";
const REQUEST_DELAY_MS = Number(win.REQUEST_DELAY_MS ?? env.VITE_REQUEST_DELAY_MS ?? 1100) || 1100;

// CSV inicial (opcional). Si no lo pones, te pedirá cargar CSV manualmente.
const CSV_URL = (win.CSV_URL ?? env.VITE_CSV_URL ?? "") || "";

// Objetito unificado
const CONFIG = { API_KEY, API_BASE, SYMBOL, REQUEST_DELAY_MS, CSV_URL };

// Export y compat
export { CONFIG };
export default CONFIG;
if (win && !win.CONFIG) { try { win.CONFIG = CONFIG; } catch {} }
