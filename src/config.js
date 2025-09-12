// src/config.js

// Unifica configuración desde window.* y variables .env de Vite.
const win = (typeof window !== "undefined") ? window : {};

// Lee primero las variables globales DEFINIDAS EN public/config.js
const METALS_API_KEY =
  (win.METALS_API_KEY ?? "") ||
  (import.meta?.env?.VITE_METALS_API_KEY ?? "") ||
  "";

const EPITOME_API =
  (win.EPITOME_API ?? "") ||
  (import.meta?.env?.VITE_EPITOME_API ?? "") ||
  "";

const EPITOME_ON =
  (typeof win.EPITOME_ON === "boolean")
    ? win.EPITOME_ON
    : (import.meta?.env?.VITE_EPITOME_ON === "true");

// CSV_URL es opcional: puede venir de window o de .env; si no, deja vacío.
const CSV_URL =
  (win.CSV_URL ?? "") ||
  (import.meta?.env?.VITE_CSV_URL ?? "") ||
  "";

// Objeto unificado de configuración
const _CONFIG = {
  METALS_API_KEY,
  EPITOME_API,
  EPITOME_ON,
  CSV_URL
};

// Export named + default para máxima compatibilidad
export const CONFIG = _CONFIG;
export default _CONFIG;

// Además, expón window.CONFIG si no existe, para cualquier código legacy que lo use.
if (win && !win.CONFIG) {
  try { win.CONFIG = _CONFIG; } catch (e) { /* no-op en SSR */ }
}
