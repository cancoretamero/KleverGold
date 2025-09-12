// /config.js (RAÍZ DEL PROYECTO)
// Este script se ejecuta antes del bundle y define variables globales.
// Lo cargamos como módulo desde index.html para que Vite no se queje.

window.METALS_API_KEY = "0zs12hfbt7uf6jf5brv7xpq8o8175lpnwmpamvqkoz238mjqjyxxhdji4fb4";

// === EPITOME (backend en la nube) ===
window.EPITOME_API = "https://klevergold-epitome.onrender.com";
window.EPITOME_ON = true;

// (Opcional) Ruta al CSV de arranque si la usa tu app:
window.CSV_URL = window.CSV_URL || "./data/xauusd_ohlc_clean.csv";

// Export vacío para que el archivo sea un módulo válido (no hace falta importar nada).
export {};
