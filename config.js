// /config.js (RAÍZ DEL PROYECTO) — CARGA ANTES DEL BUNDLE
window.METALS_API_KEY = "0zs12hfbt7uf6jf5brv7xpq8o8175lpnwmpamvqkoz238mjqjyxxhdji4fb4";

// === EPITOME (proxyado por Netlify) ===
window.EPITOME_API = "/api";      // <<<<< clave para evitar CORS
window.EPITOME_ON = true;

// CSV de arranque
window.CSV_URL = window.CSV_URL || "./data/xauusd_ohlc_clean.csv";

// Módulo ES válido
export {};
