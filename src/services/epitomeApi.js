// src/services/epitomeApi.js
import { CONFIG } from '../config'
import Papa from 'papaparse'

function parseCsv(text) {
  const { data } = Papa.parse(text.trim(), { header: true, skipEmptyLines: true })
  // Normaliza campos
  const rows = data
    .map(r => ({
      date: (r.date || r.ds || r.Date || r.DS || '').trim(),
      close: Number(r.close ?? r.y ?? r.Close ?? r.CLOSE ?? r.price ?? r.Price)
    }))
    .filter(r => r.date && Number.isFinite(r.close))
  // ordenar por fecha asc
  rows.sort((a, b) => new Date(a.date) - new Date(b.date))
  return rows
}

export async function loadSeriesFromCsvUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No pude descargar CSV: ${res.status}`)
  const text = await res.text()
  return parseCsv(text)
}

async function postJSON(path, body) {
  const base = CONFIG.EPITOME_API || ''
  if (!base) throw new Error('EPITOME_API no está configurado')
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`Error ${res.status} en ${path}: ${msg}`)
  }
  return res.json()
}

export async function apiForecast(series, horizon = 24, coverage = 0.9) {
  return postJSON('/forecast', { series, horizon, coverage, freq: 'D' })
}

export async function apiRegime(series, lookback = 1000) {
  return postJSON('/regime', { series, lookback })
}

export async function apiRisk(series, lookback = 500, alpha = 0.95) {
  return postJSON('/risk', { series, lookback, alpha })
}
