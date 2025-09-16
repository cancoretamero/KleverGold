// src/config.js

// Estos valores se leen de variables de entorno de Vite (prefijadas con VITE_) o usan un valor por defecto.
// BACKEND_BASE: dominio del backend Express (por defecto cadena vacía → mismo origen).
// SYMBOL      : par metal-divisa a consultar (por defecto XAUUSD).
// CSV_URL     : ubicación del CSV limpio en la carpeta /public/data.

const BACKEND_BASE = (import.meta.env.VITE_BACKEND_BASE || '').replace(/\/$/, '');
const SYMBOL = import.meta.env.VITE_SYMBOL || 'XAUUSD';
const CSV_URL = import.meta.env.VITE_CSV_URL || '/data/xauusd_ohlc_clean.csv';

// Exportamos la configuración como objeto.
export const CONFIG = { BACKEND_BASE, SYMBOL, CSV_URL };
export default CONFIG;
