// src/config.js

// Estos valores se leen de variables de entorno de Vite (prefijadas con VITE_) o usan un valor por defecto.
// API_BASE: dominio del proveedor (por defecto https://metals-api.com/api).
// API_KEY : clave de Metals-API (por defecto cadena vacía, lo que indicará que no hay key).
// SYMBOL  : par metal-divisa a consultar (por defecto XAUUSD).
// CSV_URL : ubicación del CSV limpio en la carpeta /public/data.
// REQUEST_DELAY_MS: retardo entre llamadas al API (para evitar límites).

const API_BASE = import.meta.env.VITE_METALS_API_BASE || 'https://metals-api.com/api';
const API_KEY  = import.meta.env.VITE_METALS_API_KEY  || '';
const SYMBOL   = import.meta.env.VITE_SYMBOL          || 'XAUUSD';
const CSV_URL  = import.meta.env.VITE_CSV_URL         || '/data/xauusd_ohlc_clean.csv';
const REQUEST_DELAY_MS = Number(import.meta.env.VITE_REQUEST_DELAY_MS ?? 1100);

// Exportamos la configuración como objeto.
// Otros módulos (como GoldNowSection) leerán CONFIG.API_KEY, CONFIG.API_BASE, etc.
export const CONFIG = { API_BASE, API_KEY, SYMBOL, CSV_URL, REQUEST_DELAY_MS };
export default CONFIG;
