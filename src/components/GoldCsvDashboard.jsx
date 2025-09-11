import React, { useMemo, useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, ReferenceLine } from 'recharts'
import { Upload, Calendar, TrendingUp, Maximize2, Gauge, RefreshCcw, Database, CloudDownload } from "lucide-react"
import CandleChart from './CandleChart.jsx'
import Kpi from './Kpi.jsx'
import TopTable from './TopTable.jsx'
import CsvLoader from './CsvLoader.jsx'
import { CONFIG } from '../config.js'
import { aggregateOhlc, enumerateDays, quantile, loadCsvFromUrl } from '../utils.js'
import { fetchMissingDaysSequential } from '../api.js'
import { loadExtraFromLS, saveExtraToLS, mapByDate, rowsFromMap } from '../storage.js'

'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ReferenceLine } from 'recharts';
import { RefreshCcw } from 'lucide-react';

/**
 * GoldNowSection — Widget "Últimos datos del oro" (estética v6 + liquid glass)
 * --------------------------------------------------------------------------------
 * Colócalo justo debajo del bloque "CSV: data/xauusd_ohlc_clean.csv" en tu dashboard.
 *
 * Requisitos cumplidos:
 *  - Usa las filas existentes del CSV (prop rows)
 *  - Rellena huecos desde el último día del CSV hasta HOY con Metals API (fetchOhlcDayFromMetals)
 *  - Persiste lo descargado a través del callback onAppendRows (el padre ya lo guarda en LS)
 *  - Muestra: fecha actual, precio más actualizado, Δ vs día previo, CAGR nominal desde Bretton Woods (1944-07-22)
 *  - Mini sparkline 60 días, tooltip liquid-glass, estilo blanco y paleta sutil
 */

// Paleta sutil (igual que V6)
const PALETTE = {
  fill: '#C7D2FE', // indigo-200
  stroke: '#818CF8',
  accent: '#0ea5e9',
  up: '#10b981',
  down: '#ef4444',
  grid: 'rgba(0,0,0,0.06)'
};

export default function GoldNowSection({ rows = [], onAppendRows }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  // === Helpers ===
  function iso(d) { return d.toISOString().slice(0,10); }
  const today = useMemo(() => new Date(new Date().toISOString().slice(0,10)), []); // UTC midnight

  // Ordena por fecha por si acaso
  const ordered = useMemo(() => (rows || []).slice().sort((a,b) => +a.date - +b.date), [rows]);
  const lastCsvDate = ordered.length ? ordered[ordered.length-1].date : null;

  const lastClose = ordered.length ? ordered[ordered.length-1].close : null;
  const prevClose = ordered.length > 1 ? ordered[ordered.length-2].close : null;
  const lastDateIso = lastCsvDate ? iso(lastCsvDate) : null;

  // Sparkline últimos 60 días (tras ordenado)
  const sparkData = useMemo(() => {
    const take = ordered.slice(-60).map(r => ({ t: iso(r.date), v: r.close }));
    return take;
  }, [ordered]);

  // CAGR desde Bretton Woods (1944-07-22)
  const cagr = useMemo(() => {
    if (!ordered.length) return null;
    const START = new Date(Date.UTC(1944, 6, 22));
    const startRow = ordered.find(r => +r.date >= +START) || ordered[0];
    const endRow = ordered[ordered.length-1];
    const years = Math.max(0.0001, (endRow.date - startRow.date) / (365.25*24*3600*1000));
    const start = startRow.close;
    const end = endRow.close;
    if (!(isFinite(start) && isFinite(end))) return null;
    const c = Math.pow(end / Math.max(start, 1e-9), 1/years) - 1;
    return c;
  }, [ordered]);

  // === Actualización desde Metals API (usa helpers globales del dashboard) ===
  const gapsToToday = useMemo(() => {
    if (!lastCsvDate) return [];
    const days = [];
    for (let d = new Date(new Date(lastCsvDate).getTime() + 86400000); d <= today; d = new Date(d.getTime() + 86400000)) {
      days.push(iso(d));
    }
    return days;
  }, [lastCsvDate, today]);

  const canFetch = typeof fetchOhlcDayFromMetals === 'function';

  const updateNow = useCallback(async () => {
    if (!canFetch || !gapsToToday.length) { setLastFetchedAt(new Date()); return; }
    setLoading(true); setError('');
    try {
      // Reutiliza el throttle del dashboard si existe
      const rowsNew = await fetchMissingDaysSequential(gapsToToday);
      if (rowsNew?.length && typeof onAppendRows === 'function') {
        onAppendRows(rowsNew);
      }
      setLastFetchedAt(new Date());
    } catch (e) {
      setError(e?.message || 'No se pudo actualizar desde Metals API');
    } finally { setLoading(false); }
  }, [gapsToToday, onAppendRows, canFetch]);

  useEffect(() => { updateNow(); /* auto al montar */ }, []); // eslint-disable-line

  const liveClose = ordered.length ? ordered[ordered.length-1].close : null;
  const delta = (isFinite(liveClose) && isFinite(prevClose)) ? (liveClose - prevClose) : null;
  const deltaPct = (isFinite(liveClose) && isFinite(prevClose) && prevClose !== 0)
    ? (liveClose/prevClose - 1) : null;

  // === UI ===
  return (
    <section className="rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)] p-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">Últimos datos del oro</div>
        <button
          onClick={updateNow}
          disabled={loading}
          className="inline-flex items-center gap-2 text-xs rounded-md border px-2 py-1 disabled:opacity-60"
        >
          <RefreshCcw className="w-3.5 h-3.5" /> {loading ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      </div>

      {/* Panel superior: precio actual + chips */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold tracking-tight">{isFinite(liveClose) ? liveClose.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—'}</div>
            {isFinite(delta) && (
              <span className={`text-sm font-medium ${delta>=0?'text-emerald-600':'text-rose-600'}`}>{delta>=0?'+':''}{delta.toFixed(2)} ({deltaPct>=0?'+':''}{(deltaPct*100).toFixed(2)}%)</span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {`Hoy ${iso(today)} · ${lastDateIso ? `último dato: ${lastDateIso}` : ''}`} {lastFetchedAt && `· actualizado ${lastFetchedAt.toLocaleTimeString()}`}
            {!canFetch && <span className="ml-2 text-amber-700">(API no disponible en este entorno)</span>}
          </div>
        </div>

        {/* Chips liquid glass */}
        <div className="flex items-start justify-end gap-2">
          <GlassChip label="CAGR desde 1944" value={cagr!=null ? `${(cagr*100).toFixed(2)}%` : '—'} tone={cagr!=null ? (cagr>=0?'pos':'neg') : 'neutral'} />
          <GlassChip label="Sesiones" value={ordered.length.toLocaleString('es-ES')} />
        </div>
      </div>

      {/* Sparkline */}
      <div className="mt-4 h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 6" stroke={PALETTE.grid} />
            <XAxis dataKey="t" tick={{ fill: '#111', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={32} />
            <YAxis tick={{ fill: '#111', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
            <ReferenceLine y={0} stroke="#111" opacity={0.1} />
            <RTooltip cursor={false} content={<SparkGlassTooltip />} />
            <Area type="monotone" dataKey="v" stroke={PALETTE.stroke} strokeWidth={1.6} fill={PALETTE.fill + '66'} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {error && <div className="mt-2 text-xs text-rose-700">{error}</div>}
    </section>
  );
}

function GlassChip({ label, value, tone='neutral' }) {
  const toneCls = tone==='pos' ? 'text-emerald-700' : tone==='neg' ? 'text-rose-700' : 'text-gray-900/90';
  return (
    <div
      className={`relative rounded-2xl border border-white/30 bg-white/10 text-xs overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.6)] px-3 py-2 ${toneCls}`}
      style={{ backdropFilter: 'blur(12px) saturate(170%)', WebkitBackdropFilter: 'blur(12px) saturate(170%)' }}
    >
      <div className="font-medium">{value}</div>
      <div className="text-[10px] text-gray-600">{label}</div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/30 rounded-2xl" />
    </div>
  );
}

function SparkGlassTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0]?.value;
  return (
    <div
      className="relative min-w-[160px] rounded-2xl border border-white/30 bg-white/10 text-xs overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.6)]"
      style={{ backdropFilter: 'blur(14px) saturate(170%)', WebkitBackdropFilter: 'blur(14px) saturate(170%)' }}
    >
      <div className="p-2">
        <div className="font-medium text-gray-900/90">{label}</div>
        <div className="text-right font-semibold text-gray-900/90">{isFinite(v)? Number(v).toLocaleString('es-ES'):'—'}</div>
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/30 rounded-2xl" />
    </div>
  );
}


// NUEVOS imports
import YearGroupSelector from './YearGroupSelector.jsx'
import HScrollCarousel from './HScrollCarousel.jsx'
import ModernHistograms from './ModernHistograms.jsx'

export default function GoldCsvDashboard() {
  const [baseRows, setBaseRows] = useState([]); // CSV limpio
  const [extraRows, setExtraRows] = useState(loadExtraFromLS()); // días añadidos vía API
  const [rangeKey, setRangeKey] = useState("max");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fitNonce, setFitNonce] = useState(0);
  const [engine, setEngine] = useState("auto"); // auto | kline | lwc
  const [mode, setMode] = useState("candlestick"); // candlestick | ohlc | area
  const [loadingBase, setLoadingBase] = useState(false);
  const [filling, setFilling] = useState(false);

  // === Estudio anual/mensual ===
  const [selectedYears, setSelectedYears] = useState([]);
  const [yearFocus, setYearFocus] = useState(null);
  const [monthFocus, setMonthFocus] = useState(null);
  const [filterOutliers, setFilterOutliers] = useState(true); // p99
  const [selectedDay, setSelectedDay] = useState(null);
  const [monthlyStat, setMonthlyStat] = useState('avg');

  // 0) Carga automática del CSV limpio si existe URL
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!CONFIG.CSV_URL) return;
      setLoadingBase(true);
      try {
        const rows = await loadCsvFromUrl(CONFIG.CSV_URL);
        if (mounted) setBaseRows(rows);
      } catch (e) {
        console.warn("Fallo al cargar CSV predefinido", e);
      } finally {
        if (mounted) setLoadingBase(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 1) Permitir reemplazar/añadir CSV manualmente (suma y sobrescribe por fecha)
  function onCsvUpload(rows) {
    const map = mapByDate(rows);
    const current = mapByDate(baseRows);
    for (const [k, v] of map.entries()) current.set(k, v);
    const merged = rowsFromMap(current);
    setBaseRows(merged);
  }

  // 2) Datos combinados (CSV + extra)
  const rows = useMemo(() => {
    const m = mapByDate(baseRows);
    for (const r of extraRows) m.set(r.date.toISOString().slice(0, 10), r);
    return rowsFromMap(m);
  }, [baseRows, extraRows]);

  // 3) Metadatos
  const meta = useMemo(() => {
    if (!rows.length) return null;
    const first = rows[0].date, last = rows[rows.length - 1].date;
    const minP = Math.min(...rows.map((r) => r.low));
    const maxP = Math.max(...rows.map((r) => r.high));
    return { first, last, sessions: rows.length, minP, maxP };
  }, [rows]);

  // 4) Rango preset
  const presetRange = useMemo(() => {
    if (!rows.length) return { from: null, to: null };
    const end = rows[rows.length - 1].date;
    const start = new Date(end);
    switch (rangeKey) {
      case "1m": start.setUTCMonth(start.getUTCMonth() - 1); break;
      case "3m": start.setUTCMonth(start.getUTCMonth() - 3); break;
      case "6m": start.setUTCMonth(start.getUTCMonth() - 6); break;
      case "ytd": start.setUTCMonth(0); start.setUTCDate(1); start.setUTCFullYear(end.getUTCFullYear()); break;
      case "1y": start.setUTCFullYear(start.getUTCFullYear() - 1); break;
      case "5y": start.setUTCFullYear(start.getUTCFullYear() - 5); break;
      case "custom": return { from: from ? new Date(from) : null, to: to ? new Date(to) : null };
      case "max":
      default: return { from: rows[0].date, to: end };
    }
    return { from: start, to: end };
  }, [rangeKey, rows, from, to]);

  // 5) Filtrado sobre el rango activo
  const filtered = useMemo(() => {
    let out = rows;
    const f = presetRange.from, t = presetRange.to;
    if (f) out = out.filter((r) => +r.date >= +f);
    if (t) out = out.filter((r) => +r.date <= +t);
    return out;
  }, [rows, presetRange]);

  // 6) Serie de velas con downsampling
  const candleRows = useMemo(() => aggregateOhlc(filtered, 3000), [filtered]);

  // 7) KPIs
  const kpis = useMemo(() => {
    if (!filtered.length) return null;
    const avg = filtered.reduce((s, r) => s + r.range, 0) / filtered.length;
    let maxRow = filtered[0];
    for (const r of filtered) if (r.range > maxRow.range) maxRow = r;
    const monthlyMap = new Map();
    for (const r of filtered) {
      const key = `${r.date.getUTCFullYear()}-${String(r.date.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap.has(key)) monthlyMap.set(key, { sum: 0, n: 0 });
      const m = monthlyMap.get(key);
      m.sum += r.range;
      m.n += 1;
    }
    const monthly = Array.from(monthlyMap.entries()).map(([k, v]) => ({ month: k, avg: v.sum / v.n })).sort((a, b) => a.month.localeCompare(b.month));
    return { avg, maxR: maxRow.range, maxRow, monthly, days: filtered.length };
  }, [filtered]);

  // === Estudio anual/mensual/día ===
  const yearsAvailable = useMemo(() => {
    const s = new Set(rows.map((r) => r.year));
    return Array.from(s).filter(Boolean).sort((a, b) => a - b);
  }, [rows]);

  useEffect(() => {
    if (!yearsAvailable.length) return;
    if (selectedYears.length === 0) {
      setSelectedYears(yearsAvailable.slice(-3));
    }
    if (!yearFocus) setYearFocus(yearsAvailable[yearsAvailable.length - 1]);
    if (!monthFocus && rows.length) setMonthFocus(rows[rows.length - 1].date.getUTCMonth() + 1);
  }, [yearsAvailable, rows]);

  const analysisPool = useMemo(() => {
    let pool = rows.filter((r) => (selectedYears.length ? selectedYears.includes(r.year) : true));
    if (filterOutliers && pool.length > 10) {
      const arr = pool.map((r) => r.range).filter(Number.isFinite).sort((a, b) => a - b);
      const thr = quantile(arr, 0.995);
      pool = pool.filter((r) => r.range <= thr && r.range >= 0);
    }
    return pool;
  }, [rows, selectedYears, filterOutliers]);

  const yearSummaries = useMemo(() => {
    const map = new Map();
    for (const y of selectedYears) {
      const yrRows = analysisPool.filter((r) => r.year === y);
      if (!yrRows.length) continue;
      const sum = yrRows.reduce((s, r) => s + r.range, 0);
      let maxRow = yrRows[0];
      for (const r of yrRows) if (r.range > maxRow.range) maxRow = r;
      const monthMap = new Map(); // month -> number[]
      for (const r of yrRows) {
        const k = r.month;
        if (!monthMap.has(k)) monthMap.set(k, []);
        monthMap.get(k).push(r.range);
      }
      const monthly = Array.from({ length: 12 }, (_, i) => {
        const arr = monthMap.get(i + 1) || [];
        if (arr.length === 0) return { month: i + 1, avg: 0, median: 0, n: 0 };
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        const med = arr.slice().sort((a, b) => a - b)[Math.floor((arr.length - 1) * 0.5)];
        return { month: i + 1, avg, median: med, n: arr.length };
      });
      map.set(y, { year: y, days: yrRows.length, avg: sum / yrRows.length, maxRow, monthly });
    }
    return map;
  }, [analysisPool, selectedYears]);

  const monthlyComparative = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({ month: String(i + 1).padStart(2, '0') }));
    for (const y of selectedYears) {
      const s = yearSummaries.get(y);
      if (!s) continue;
      for (let i = 0; i < 12; i++) {
        const stat = monthlyStat === 'median' ? (s.monthly[i]?.median || 0) : (s.monthly[i]?.avg || 0);
        months[i][String(y)] = stat;
      }
    }
    return months;
  }, [yearSummaries, selectedYears, monthlyStat]);

  const dailyMonth = useMemo(() => {
    if (!yearFocus || !monthFocus) return [];
    return analysisPool
      .filter((r) => r.year === yearFocus && r.month === Number(monthFocus))
      .map((r) => ({ day: r.date.getUTCDate(), dateLabel: r.date.toISOString().slice(0, 10), ...r }))
      .sort((a, b) => a.day - b.day);
  }, [analysisPool, yearFocus, monthFocus]);

  const gaps = useMemo(() => {
    if (!presetRange.from || !presetRange.to || !rows.length) return [];
    const allDays = enumerateDays(presetRange.from, presetRange.to).map((d) => d.toISOString().slice(0, 10));
    const have = new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
    return allDays.filter((d) => !have.has(d));
  }, [presetRange, rows]);

  async function fillGaps() {
    if (!gaps.length) return;
    setFilling(true);
    try {
      const rowsNew = await fetchMissingDaysSequential(gaps);
      if (!rowsNew.length) return;
      const m = mapByDate(extraRows);
      for (const r of rowsNew) m.set(r.date.toISOString().slice(0, 10), r);
      const merged = rowsFromMap(m);
      setExtraRows(merged);
      saveExtraToLS(merged);
    } finally {
      setFilling(false);
    }
  }

  const needCsv = baseRows.length === 0 && !loadingBase;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap gap-3 justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard de Oro</h1>
        {meta && (
          <div className="text-xs text-gray-700 bg-gray-100 rounded-md px-3 py-2 inline-flex items-center gap-2">
            <Database className="w-4 h-4" />
            Cobertura: <strong>{meta.first.toISOString().slice(0, 10)}</strong> → <strong>{meta.last.toISOString().slice(0, 10)}</strong>
            · Sesiones: <strong>{meta.sessions.toLocaleString("es-ES")}</strong>
            · Min/Max: <strong>{meta.minP}</strong>/<strong>{meta.maxP}</strong>
          </div>
        )}
      </header>

      <section className="rounded-2xl border bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="text-sm flex items-center gap-2">
          <CloudDownload className="w-4 h-4" />
          <span>
            CSV: {CONFIG.CSV_URL ? (
              <span className="font-medium">{CONFIG.CSV_URL}</span>
            ) : (
              <span className="text-amber-700">sin URL</span>
            )}
          </span>
        </div>
        <div className="ml-auto text-xs text-gray-500">API key {CONFIG.API_KEY ? "presente" : "ausente"}</div>
      </section>

      {needCsv && <CsvLoader onData={onCsvUpload} />}

      {baseRows.length > 0 && (
        <>
          <div className="rounded-2xl border bg-white p-4 flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { k: "1m", l: "1m" },
                { k: "3m", l: "3m" },
                { k: "6m", l: "6m" },
                { k: "ytd", l: "YTD" },
                { k: "1y", l: "1y" },
                { k: "5y", l: "5y" },
                { k: "max", l: "MAX" },
                { k: "custom", l: "CUSTOM" },
              ].map((b) => (
                <button
                  key={b.k}
                  onClick={() => setRangeKey(b.k)}
                  className={`px-2.5 py-1.5 text-xs rounded-md border ${rangeKey === b.k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white hover:bg-gray-50"}`}
                >
                  {b.l}
                </button>
              ))}
            </div>
            {rangeKey === "custom" && (
              <div className="flex items-end gap-2 ml-2">
                <div className="flex flex-col text-xs"><label>Desde</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1 border rounded" /></div>
                <div className="flex flex-col text-xs"><label>Hasta</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1 border rounded" /></div>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {gaps.length > 0 && (
                <button onClick={fillGaps} disabled={filling} className="px-2 py-1.5 rounded-md border text-sm inline-flex items-center gap-2 bg-emerald-600 text-white disabled:opacity-50">
                  Completar huecos ({gaps.length})
                </button>
              )}
              <label className="text-xs text-gray-500">Motor</label>
              <select value={engine} onChange={(e) => setEngine(e.target.value)} className="px-2 py-1.5 rounded-md border text-sm">
                <option value="auto">Auto</option>
                <option value="kline">KLine</option>
                <option value="lwc">Lightweight</option>
              </select>
              <label className="text-xs text-gray-500">Modo</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-2 py-1.5 rounded-md border text-sm">
                <option value="candlestick">Candlestick</option>
                <option value="ohlc">OHLC</option>
                <option value="area">Área</option>
              </select>
              <button onClick={() => setFitNonce((n) => n + 1)} className="px-2 py-1.5 rounded-md border text-sm inline-flex items-center gap-1">
                <RefreshCcw className="w-3.5 h-3.5" />Reset vista
              </button>
            </div>
          </div>

          {kpis && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi icon={Gauge} label="Variación media diaria" value={kpis.avg.toFixed(2)} hint="High-Low promedio" />
              <Kpi icon={Maximize2} label="Máxima variación diaria" value={kpis.maxR.toFixed(2)} hint={kpis.maxRow.date.toISOString().slice(0, 10)} />
              <Kpi icon={TrendingUp} label="Mes más volátil" value={kpis.monthly.slice().sort((a, b) => b.avg - a.avg)[0]?.month || "—"} />
              <Kpi icon={Calendar} label="Días" value={kpis.days} />
            </div>
          )}
        </>
      )}

      {baseRows.length > 0 && (
        <section className="border rounded-2xl p-4 bg-white space-y-4">
          {/* === CONTROLES NUEVOS: selector compacto + focos === */}
          <div className="space-y-3">
            <YearGroupSelector
              years={yearsAvailable}
              selectedYears={selectedYears}
              onChange={(ys) => setSelectedYears(ys)}
            />
            <div className="flex items-center gap-2 justify-end">
              <label className="text-xs text-gray-500">Año foco</label>
              <select value={yearFocus ?? ''} onChange={(e) => setYearFocus(Number(e.target.value))} className="px-2 py-1.5 rounded-md border text-sm">
                {yearsAvailable.map((y) => (<option value={y} key={y}>{y}</option>))}
              </select>
              <label className="text-xs text-gray-500">Mes</label>
              <select value={monthFocus ?? ''} onChange={(e) => setMonthFocus(Number(e.target.value))} className="px-2 py-1.5 rounded-md border text-sm">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (<option key={m} value={m}>{String(m).padStart(2, '0')}</option>))}
              </select>
              <label className="text-xs text-gray-500 inline-flex items-center gap-1">
                <input type="checkbox" className="accent-indigo-600" checked={filterOutliers} onChange={(e) => setFilterOutliers(e.target.checked)} />
                Filtro outliers p99
              </label>
            </div>
          </div>

          {/* Resumen por año seleccionado */}
          <HScrollCarousel itemWidth={280} ariaLabel="KPIs por año">
            {selectedYears.map((y) => {
              const s = yearSummaries.get(y);
              if (!s) return null;
              return (
                <Kpi
                  key={y}
                  icon={Gauge}
                  label={`Media diaria ${y}`}
                  value={s.avg.toFixed(2)}
                  hint={`Días: ${s.days} · Máx: ${s.maxRow.range.toFixed(2)} (${s.maxRow.date.toISOString().slice(0,10)})`}
                />
              );
            })}
          </HScrollCarousel>

          {/* ==== AQUI cambiamos ambos BarChart por el componente nuevo ==== */}
          <ModernHistograms
            monthlyComparative={monthlyComparative}
            years={selectedYears}
            dailyMonth={dailyMonth}
            dailyValueKey="range"
            title="Comparativa mensual"
            statLabel={monthlyStat === 'median' ? 'Mediana' : 'Media'}
            heightMonthly={360}
            heightDaily={320}
            onDailyBarClick={(p) => setSelectedDay(p)}
          />

          {selectedDay && (
            <div className="p-4 rounded-2xl border bg-gray-50 text-sm">
              <div className="font-semibold mb-1">Día seleccionado: {selectedDay.dateLabel}</div>
              <div className="flex flex-wrap gap-4">
                <div>Open: <strong>{selectedDay.open}</strong></div>
                <div>High: <strong>{selectedDay.high}</strong></div>
                <div>Low: <strong>{selectedDay.low}</strong></div>
                <div>Close: <strong>{selectedDay.close}</strong></div>
                <div>Rango: <strong>{selectedDay.range.toFixed(2)}</strong></div>
              </div>
            </div>
          )}
        </section>
      )}

      {baseRows.length > 0 && (
        <>
          <section className="border rounded-2xl p-4 bg-white">
            <h3 className="font-semibold mb-2">Velas</h3>
            <CandleChart data={candleRows} height={420} engine={engine} mode={mode} fitNonce={fitNonce} />
          </section>

          <section className="border rounded-2xl p-4 bg-white">
            <h3 className="font-semibold mb-2">Variación diaria (High−Low)</h3>
            <div className="w-full h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filtered.map((r) => ({ date: r.date.toISOString().slice(0, 10), range: r.range }))} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" minTickGap={24} />
                  <YAxis domain={["auto", "auto"]} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(2)} USD`, "Rango"]} />
                  <Line type="monotone" dataKey="range" dot={false} strokeWidth={1.5} />
                  <Brush height={24} travellerWidth={8} />
                  <ReferenceLine y={kpis?.avg ?? 0} strokeDasharray="4 4" label={{ value: "Media", position: "insideTopRight" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="border rounded-2xl p-4 bg-white">
            <h3 className="font-semibold mb-2">Top 15 días por rango</h3>
            <TopTable rows={filtered.slice().sort((a, b) => b.range - a.range).slice(0, 15)} />
          </section>
        </>
      )}
    </div>
  );
}
