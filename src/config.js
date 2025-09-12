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

// EPITOME_ON: si viene de window es boolean, si viene de .env es string "true"/"false"
const EPITOME_ON =
  (typeof win.EPITOME_ON === "boolean")
    ? win.EPITOME_ON
    : (import.meta?.env?.VITE_EPITOME_ON === "true");

// CSV_URL es opcional: puede venir de window o de .env; si no, deja vacío para que tu app decida.
const CSV_URL =
  (win.CSV_URL ?? "") ||
  (import.meta?.env?.VITE_CSV_URL ?? "") ||
  "";

// Objeto unificado
const CONFIG = {
  METALS_API_KEY,
  EPITOME_API,
  EPITOME_ON,
  CSV_URL
};

// EXPORTE por defecto y nombrados (para máxima compatibilidad)
export default CONFIG;
export { METALS_API_KEY, EPITOME_API, EPITOME_ON, CSV_URL };

// Además, expón window.CONFIG si no existe, para cualquier código legacy que lo use.
if (win && !win.CONFIG) {
  try { win.CONFIG = CONFIG; } catch (e) { /* no-op en SSR */ }
}
