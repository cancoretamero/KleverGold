export const CONFIG = {
  // Usa ruta *relativa* para que funcione en GitHub Pages (subcarpeta)
  CSV_URL: "data/xauusd_ohlc_clean.csv",
  SYMBOL: "XAUUSD",

  // Metals API (ya existente)
  API_BASE: "https://metals-api.com/api",
  API_KEY:
    (typeof process !== "undefined" && process?.env?.VITE_METALS_API_KEY) ||
    (typeof import.meta !== "undefined" && import.meta?.env?.VITE_METALS_API_KEY) ||
    (typeof window !== "undefined" && window.METALS_API_KEY) ||
    "",

  REQUEST_DELAY_MS: 1100,

  // === EPITOME (nuevo) ===
  // URL del backend (puedes sobreescribir con VITE_EPITOME_API en .env si quieres)
  EPITOME_API:
    (typeof process !== "undefined" && process?.env?.VITE_EPITOME_API) ||
    (typeof import.meta !== "undefined" && import.meta?.env?.VITE_EPITOME_API) ||
    (typeof window !== "undefined" && window.EPITOME_API) ||
    "http://localhost:9000",

  // Flag para habilitar características EPITOME en el front
  EPITOME_ON:
    (typeof window !== "undefined" && window.EPITOME_ON) ?? false,
}
