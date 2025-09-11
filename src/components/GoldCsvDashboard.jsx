import React, { useMemo, useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Brush, ReferenceLine } from 'recharts'
import { Upload, Calendar, TrendingUp, Maximize2, Gauge, RefreshCcw, Database, CloudDownload } from "lucide-react"
import CandleChart from './CandleChart.jsx'
import Kpi from './Kpi.jsx'
import TopTable from './TopTable.jsx'
import CsvLoader from './CsvLoader.jsx'
import { CONFIG } from '../config.js'
import { aggregateOhlc, enumerateDays, quantile, loadCsvFromUrl } from '../utils.js'
import { fetchMissingDaysSequential, fetchMissingDaysOptimized, persistRowsToRepo } from '../api.js'
import { loadExtraFromLS, saveExtraToLS, mapByDate, rowsFromMap } from '../storage.js'

// NUEVOS imports
import YearGroupSelector from './YearGroupSelector.jsx'
import HScrollCarousel from './HScrollCarousel.jsx'
import ModernHistograms from './ModernHistograms.jsx'   // v7 funcional (Media/Mediana + detalle multi-año)
// NUEVO: widget de últimos datos (liquid-glass + sparkline)
import GoldNowSection from './GoldNowSection.jsx'
// NUEVO: velas modernas con tooltip liquid-glass (Lightweight)
import { CandlePanelModern } from './ModernCandleAndRange.jsx'

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
  const [monthlyStat, setMonthlyStat] = useState('avg');      // 'avg' | 'median'

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
      const monthMap = new Map();
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
      // optimizado + persistencia en repo
      const rowsNew = await fetchMissingDaysOptimized(gaps);
      if (!rowsNew.length) return;
      const m = mapByDate(extraRows);
      for (const r of rowsNew) m.set(r.date.toISOString().slice(0, 10), r);
      const merged = rowsFromMap(m);
      setExtraRows(merged);
      saveExtraToLS(merged);
      persistRowsToRepo(rowsNew).catch(()=>{});
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

      {/* Bloque de fuente CSV */}
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

      {/* === NUEVA SECCIÓN: “Últimos datos del oro” (debajo del CSV) === */}
      <GoldNowSection
        rows={rows}
        fetchMissingDaysSequential={fetchMissingDaysOptimized}
        onAppendRows={(rowsNew) => {
          if (!rowsNew?.length) return;
          const m = mapByDate(extraRows);
          for (const r of rowsNew) m.set(r.date.toISOString().slice(0,10), r);
          const merged = rowsFromMap(m);
          setExtraRows(merged);
          saveExtraToLS(merged);
          persistRowsToRepo(rowsNew).catch(()=>{});
        }}
      />

      {needCsv && <CsvLoader onData={onCsvUpload} />}

      {baseRows.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis && (
              <>
                <Kpi icon={Gauge} label="Variación media diaria" value={kpis.avg.toFixed(2)} hint="High-Low promedio" />
                <Kpi icon={Maximize2} label="Máxima variación diaria" value={kpis.maxR.toFixed(2)} hint={kpis.maxRow.date.toISOString().slice(0, 10)} />
                <Kpi icon={TrendingUp} label="Mes más volátil" value={kpis.monthly.slice().sort((a, b) => b.avg - a.avg)[0]?.month || "—"} />
                <Kpi icon={Calendar} label="Días" value={kpis.days} />
              </>
            )}
          </div>

          {/* ModernHistograms v7 */}
          <section className="border rounded-2xl p-4 bg-white space-y-4">
            <div className="space-y-3">
              <YearGroupSelector years={yearsAvailable} selectedYears={selectedYears} onChange={(ys) => setSelectedYears(ys)} />
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

            <HScrollCarousel itemWidth={280} ariaLabel="KPIs por año">
              {selectedYears.map((y) => {
                const s = yearSummaries.get(y);
                if (!s) return null;
                return (
                  <Kpi key={y} icon={Gauge} label={`Media diaria ${y}`} value={s.avg.toFixed(2)} hint={`Días: ${s.days} · Máx: ${s.maxRow.range.toFixed(2)} (${s.maxRow.date.toISOString().slice(0,10)})`} />
                );
              })}
            </HScrollCarousel>

            <ModernHistograms
              rawRows={analysisPool}
              years={selectedYears}
              dailyValueKey="range"
              title="Comparativa anual"
              stat={monthlyStat}
              onStatChange={setMonthlyStat}
              initialMonth={monthFocus}
              onDailyBarClick={(p) => setSelectedDay(p)}
            />

            {selectedDay && (
              <div className="p-4 rounded-2xl border bg-gray-50 text-sm">
                <div className="font-semibold mb-2">
                  Día seleccionado: {String(selectedDay.day).padStart(2,'0')}
                  {monthFocus ? `/${String(monthFocus).padStart(2,'0')}` : ''}
                </div>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {selectedYears.map(y => {
                    const v = selectedDay[String(y)];
                    return (
                      <div key={y} className="flex items-center justify-between rounded-md border bg-white px-2 py-1">
                        <span className="text-gray-600">{y}</span>
                        <span className="font-semibold">{Number.isFinite(v) ? v.toFixed(2) : '—'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Controles (mismos handlers) justo encima de Velas */}
          <div className="rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)] p-4 flex flex-wrap items-end gap-3">
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
                  className={`px-2.5 py-1.5 text-xs rounded-full border ${rangeKey === b.k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white hover:bg-gray-50"}`}
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
                <button onClick={fillGaps} disabled={filling} className="px-3 py-1.5 rounded-full text-sm inline-flex items-center gap-2 bg-emerald-600 text-white disabled:opacity-50">
                  Completar huecos ({gaps.length})
                </button>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Motor</span>
                <select value={engine} onChange={(e) => setEngine(e.target.value)} className="px-2 py-1.5 rounded-md border text-sm">
                  <option value="auto">Auto</option>
                  <option value="lwc">Lightweight</option>
                  <option value="kline">KLine</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Modo</span>
                <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-2 py-1.5 rounded-md border text-sm">
                  <option value="candlestick">Candlestick</option>
                  <option value="ohlc">OHLC</option>
                  <option value="area">Área</option>
                </select>
              </div>

              <button onClick={() => setFitNonce((n) => n + 1)} className="px-3 py-1.5 rounded-full border text-sm inline-flex items-center gap-1" title="Reset vista">
                <RefreshCcw className="w-3.5 h-3.5" /> Reset vista
              </button>
            </div>
          </div>

          {/* Velas: moderna si engine=auto|lwc; si no, fallback a CandleChart */}
          <section className="rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)] p-4">
            <h3 className="font-semibold mb-2">Velas</h3>
            {(engine === 'lwc' || engine === 'auto')
              ? <CandlePanelModern data={candleRows} title="Velas" height={420} />
              : <CandleChart data={candleRows} height={420} engine={engine} mode={mode} fitNonce={fitNonce} />
            }
          </section>

          {/* Variación diaria (card v6 + glass tooltip) */}
          <section className="rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)] p-4">
            <h3 className="font-semibold mb-2">Variación diaria (High−Low)</h3>
            <div className="w-full h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filtered.map((r) => ({ date: r.date.toISOString().slice(0, 10), range: r.range }))} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="date" minTickGap={24} />
                  <YAxis domain={["auto", "auto"]} />
                  <RTooltip cursor={false} content={<GlassTooltip />} />
                  <Line type="monotone" dataKey="range" dot={false} strokeWidth={1.5} />
                  <Brush height={24} travellerWidth={8} />
                  <ReferenceLine y={kpis?.avg ?? 0} strokeDasharray="4 4" label={{ value: "Media", position: "insideTopRight" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Top 15 */}
          <section className="rounded-2xl border bg-white p-4">
            <h3 className="font-semibold mb-2">Top 15 días por rango</h3>
            <TopTable rows={filtered.slice().sort((a, b) => b.range - a.range).slice(0, 15)} />
          </section>
        </>
      )}
    </div>
  );
}

/* Tooltip “liquid glass” para el LineChart */
function GlassTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0]?.value;
  return (
    <div
      className="relative min-w-[180px] rounded-2xl border border-white/30 bg-white/10 text-xs overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.6)]"
      style={{ backdropFilter: 'blur(14px) saturate(170%)', WebkitBackdropFilter: 'blur(14px) saturate(170%)' }}
    >
      <div className="p-2">
        <div className="font-medium text-gray-900/90">{label}</div>
        <div className="text-right font-semibold text-gray-900/90">{Number.isFinite(v)? Number(v).toFixed(2): '—'}</div>
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/30 rounded-2xl" />
    </div>
  );
}
