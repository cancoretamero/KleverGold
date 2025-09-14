// /config.js (RAÍZ) — versión mínima sin Epitome
// Clave pública para tu proveedor de metales (opcional si usas solo CSV)
window.METALS_API_KEY = window.METALS_API_KEY || "";

// (Opcional) Base URL de tu API de metales (cuando la conectes)
// Ejemplo: "https://api.tu-proveedor.com/v1"
window.API_BASE = window.API_BASE || "";

// (Opcional) Símbolo a usar
window.SYMBOL = window.SYMBOL || "XAUUSD";

// (Opcional) CSV inicial
window.CSV_URL = window.CSV_URL || "./data/xauusd_ohlc_clean.csv";

// (Opcional) throttling entre llamadas si tu API lo requiere
window.REQUEST_DELAY_MS = window.REQUEST_DELAY_MS || 1100;

// Módulo ES válido (no borres)
export {};
