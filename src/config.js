export const CONFIG = {
  // Usa ruta *relativa* para que funcione en GitHub Pages (subcarpeta)
  CSV_URL: "data/xauusd_ohlc_clean.csv",
  SYMBOL: "XAUUSD",
  API_BASE: "https://metals-api.com/api",
  API_KEY:
    (typeof process !== "undefined" && process?.env?.VITE_METALS_API_KEY) ||
    (typeof import.meta !== "undefined" && import.meta?.env?.VITE_METALS_API_KEY) ||
    (typeof window !== "undefined" && window.METALS_API_KEY) ||
    "",
  REQUEST_DELAY_MS: 1100,
}
