// src/services/epitomeApi.js
import { CONFIG } from '../config'
import Papa from 'papaparse'

// --- Parseador CSV (fecha+close), orden ascendente ---
function parseCsv(text) {
  const { data } = Papa.parse(String(text).trim(), { header: true, skipEmptyLines: true })
  const rows = data
    .map(r => ({
      date: String(r.date || r.ds || r.Date || r.DS || '').trim(),
      close: Number(r.close ?? r.y ?? r.Close ?? r.CLOSE ?? r.price ?? r.Price),
    }))
    .filter(r => r.date && Number.isFinite(r.close))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  return rows
}

// --- Descarga CSV y lo normaliza a [{date, close}] ---
export async function loadSeriesFromCsvUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No pude descargar CSV: ${res.status}`)
  const text = await res.text()
  return parseCsv(text)
}

// --- Historial en formato {timestamps, price} que usan tus paneles ---
export async function getHistoryFromCsv(csvUrl = CONFIG.CSV_URL) {
  if (!csvUrl) throw new Error('CSV_URL no está definido')
  const rows = await loadSeriesFromCsvUrl(csvUrl)
  return {
    timestamps: rows.map(r => r.date),
    price: rows.map(r => r.close),
  }
}

// --- Helper POST JSON al backend EPITOME ---
async function postJSON(path, body) {
  const base = CONFIG.EPITOME_API || ''
  if (!base) throw new Error('EPITOME_API no está configurado')
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`Error ${res.status} en ${path}: ${msg}`)
  }
  return res.json()
}

/* =========================
   Wrappers "FromCsv" que esperan tus componentes
   ========================= */

// Forecast probabilístico (q05–q95) + régimen embebido
export async function forecastFromCsv({ csvUrl = CONFIG.CSV_URL, horizon = 24, coverage = 0.9 } = {}) {
  const hist = await getHistoryFromCsv(csvUrl)
  return postJSON('/forecast', {
    timestamps: hist.timestamps,
    price: hist.price,
    horizon,
    coverage,
  })
}

// Riesgo (σ, μ, VaR, ES)
export async function riskFromCsv({ csvUrl = CONFIG.CSV_URL, alpha = 0.05 } = {}) {
  const hist = await getHistoryFromCsv(csvUrl)
  return postJSON('/risk', {
    timestamps: hist.timestamps,
    price: hist.price,
    alpha,
  })
}

// Régimen (HMM)
export async function regimeFromCsv({ csvUrl = CONFIG.CSV_URL } = {}) {
  const hist = await getHistoryFromCsv(csvUrl)
  return postJSON('/regime', {
    timestamps: hist.timestamps,
    price: hist.price,
  })
}

// Señales (si tu backend aún no tiene /signals, el panel mostrará su CardError)
export async function signalsFromCsv({ csvUrl = CONFIG.CSV_URL, horizon = 24, alpha = 0.05 } = {}) {
  const hist = await getHistoryFromCsv(csvUrl)
  return postJSON('/signals', {
    timestamps: hist.timestamps,
    price: hist.price,
    horizon,
    alpha,
  })
}

// Backtest (panel opcional)
export async function backtestFromCsv({
  csvUrl = CONFIG.CSV_URL,
  horizon = 24,
  alpha = 0.05,
  fees = 0,
  slippage = 0,
  stride = 1,
} = {}) {
  const hist = await getHistoryFromCsv(csvUrl)
  return postJSON('/backtest', {
    timestamps: hist.timestamps,
    price: hist.price,
    horizon,
    alpha,
    fees,
    slippage,
    stride,
  })
}

/* =========================
   APIs directas (las dejamos por compatibilidad)
   ========================= */
export async function apiForecast(series, horizon = 24, coverage = 0.9) {
  return postJSON('/forecast', { series, horizon, coverage, freq: 'D' })
}
export async function apiRegime(series, lookback = 1000) {
  return postJSON('/regime', { series, lookback })
}
export async function apiRisk(series, lookback = 500, alpha = 0.95) {
  return postJSON('/risk', { series, lookback, alpha })
}
