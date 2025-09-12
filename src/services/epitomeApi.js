// src/services/epitomeApi.js
// Cliente ligero para el backend EPITOME + utilidades CSV. Sin dependencias externas.

import { CONFIG } from "../config.js";

/** Lee un CSV como texto desde una URL. */
async function fetchCsvText(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`CSV fetch failed: ${r.status}`);
  return await r.text();
}

/** Parseo CSV básico (separador coma, cabecera en la primera fila). */
function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("CSV vacío o sin cabecera");

  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",");
    const obj = {};
    header.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
  return { header, rows };
}

/** Intenta adivinar el nombre de columna correcto entre varias opciones. */
function pickColumn(headers, candidates) {
  const lower = headers.map((h) => h.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/** Convierte una fecha cualquiera a ISO (Z) de forma segura. */
function toIsoUTC(value) {
  if (!value) return null;
  if (String(value).includes("T")) {
    const d = new Date(value);
    return isNaN(+d) ? null : d.toISOString();
  }
  const d = new Date(`${value}T00:00:00Z`);
  return isNaN(+d) ? null : d.toISOString();
}

/** Extrae series (timestamps, close) desde el CSV de tu proyecto. */
export async function getHistoryFromCsv(csvUrl = CONFIG.CSV_URL) {
  const text = await fetchCsvText(csvUrl);
  const { header, rows } = parseCsv(text);

  const timeCol =
    pickColumn(header, ["timestamp", "time", "datetime", "date"]) || header[0];
  const closeCol =
    pickColumn(header, ["close", "adj close", "adj_close", "close_price"]) ||
    header.find((h) => /close/i.test(h)) ||
    header[header.length - 1];

  if (!timeCol || !closeCol) {
    throw new Error("No encuentro columnas de tiempo/cierre en el CSV");
  }

  const parsed = rows
    .map((r) => {
      const ts = toIsoUTC(r[timeCol]);
      const px = parseFloat(String(r[closeCol]).replace(",", "."));
      return { ts, px };
    })
    .filter((r) => r.ts && Number.isFinite(r.px))
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));

  const timestamps = parsed.map((r) => r.ts);
  const price = parsed.map((r) => r.px);

  if (price.length < 60) throw new Error("Se necesitan al menos 60 filas en el CSV");
  return { timestamps, price };
}

/* ===== FORECAST ===== */
export async function requestForecast({ timestamps, price, horizon = 24, apiBase = CONFIG.EPITOME_API, }) {
  const url = `${apiBase.replace(/\/+$/, "")}/forecast`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamps, price, exog: null, horizon }),
  });
  if (!r.ok) { const t = await r.text().catch(()=> ""); throw new Error(`/forecast ${r.status}: ${t||r.statusText}`); }
  return await r.json();
}
export async function forecastFromCsv({ csvUrl = CONFIG.CSV_URL, horizon = 24 } = {}) {
  const { timestamps, price } = await getHistoryFromCsv(csvUrl);
  return await requestForecast({ timestamps, price, horizon });
}

/* ===== RISK ===== */
export async function requestRisk({ timestamps, price, alpha = 0.05, apiBase = CONFIG.EPITOME_API, }) {
  const url = `${apiBase.replace(/\/+$/, "")}/risk`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamps, price, alpha }),
  });
  if (!r.ok) { const t = await r.text().catch(()=> ""); throw new Error(`/risk ${r.status}: ${t||r.statusText}`); }
  return await r.json();
}
export async function riskFromCsv({ csvUrl = CONFIG.CSV_URL, alpha = 0.05 } = {}) {
  const { timestamps, price } = await getHistoryFromCsv(csvUrl);
  return await requestRisk({ timestamps, price, alpha });
}

/* ===== REGIME ===== */
export async function requestRegime({ timestamps, price, apiBase = CONFIG.EPITOME_API, }) {
  const url = `${apiBase.replace(/\/+$/, "")}/regime`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamps, price }),
  });
  if (!r.ok) { const t = await r.text().catch(()=> ""); throw new Error(`/regime ${r.status}: ${t||r.statusText}`); }
  return await r.json();
}
export async function regimeFromCsv({ csvUrl = CONFIG.CSV_URL } = {}) {
  const { timestamps, price } = await getHistoryFromCsv(csvUrl);
  return await requestRegime({ timestamps, price });
}

/* ===== SIGNALS ===== */
export async function requestSignals({ timestamps, price, horizon = 24, alpha = 0.05, apiBase = CONFIG.EPITOME_API, }) {
  const url = `${apiBase.replace(/\/+$/, "")}/signals`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamps, price, horizon, alpha }),
  });
  if (!r.ok) { const t = await r.text().catch(()=> ""); throw new Error(`/signals ${r.status}: ${t||r.statusText}`); }
  return await r.json();
}
export async function signalsFromCsv({ csvUrl = CONFIG.CSV_URL, horizon = 24, alpha = 0.05 } = {}) {
  const { timestamps, price } = await getHistoryFromCsv(csvUrl);
  return await requestSignals({ timestamps, price, horizon, alpha });
}

/* ===== BACKTEST ===== */
export async function requestBacktest({
  timestamps, price,
  horizon = 24, alpha = 0.05,
  stride = 5, lookback_min = 300,
  fees = 0.0002, slippage = 0.0001,
  apiBase = CONFIG.EPITOME_API,
}) {
  const url = `${apiBase.replace(/\/+$/, "")}/backtest`;
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamps, price, horizon, alpha, stride, lookback_min, fees, slippage }),
  });
  if (!r.ok) { const t = await r.text().catch(()=> ""); throw new Error(`/backtest ${r.status}: ${t||r.statusText}`); }
  return await r.json(); // { metrics, counts, equity_curve }
}
export async function backtestFromCsv({
  csvUrl = CONFIG.CSV_URL,
  horizon = 24, alpha = 0.05,
  stride = 5, lookback_min = 300,
  fees = 0.0002, slippage = 0.0001,
} = {}) {
  const { timestamps, price } = await getHistoryFromCsv(csvUrl);
  return await requestBacktest({ timestamps, price, horizon, alpha, stride, lookback_min, fees, slippage });
}
