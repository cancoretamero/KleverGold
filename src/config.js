// /src/config.js

const win = (typeof window !== "undefined") ? window : {};

// Prioridad: variables globales definidas por /config.js
const METALS_API_KEY =
  (win.METALS_API_KEY ?? "") ||
  (import.meta?.env?.VITE_METALS_API_KEY ?? "") || "";

const EPITOME_API =
  (win.EPITOME_API ?? "") ||
  (import.meta?.env?.VITE_EPITOME_API ?? "") || "";

const EPITOME_ON =
  (typeof win.EPITOME_ON === "boolean")
    ? win.EPITOME_ON
    : (import.meta?.env?.VITE_EPITOME_ON === "true");

const CSV_URL =
  (win.CSV_URL ?? "") ||
  (import.meta?.env?.VITE_CSV_URL ?? "") || "";

// Objeto unificado
const _CONFIG = { METALS_API_KEY, EPITOME_API, EPITOME_ON, CSV_URL };

// Export named + default
export const CONFIG = _CONFIG;
export default _CONFIG;

// Exponer window.CONFIG para compatibilidad si alguien lo usa
if (win && !win.CONFIG) {
  try { win.CONFIG = _CONFIG; } catch { /* no-op */ }
}
