'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ReferenceLine } from 'recharts';
import { RefreshCcw } from 'lucide-react';

/**
 * GoldNowSection — Widget “Últimos datos del oro” (estética v6 + liquid glass)
 * -----------------------------------------------------------------------------
 * Colócalo justo debajo del bloque "CSV: data/xauusd_ohlc_clean.csv" en tu dashboard.
 *
 * Requisitos:
 *  - Usa las filas existentes del CSV (prop `rows` con objetos {date: Date, close, ...})
 *  - Rellena huecos desde el último día hasta HOY con una función de fetch (props.fetchMissingDaysSequential / Optimized)
 *  - Llama a `onAppendRows(newRows)` para que el padre actualice caché local y PERSISTENCIA en GitHub.
 *  - Muestra: fecha actual, último precio, Δ diaria y dos CAGRs 1971 (paridad 35 y 1er cierre).
 *  - Sparkline 60 días con tooltip “liquid glass”.
 */

const PALETTE = {
  fill: '#C7D2FE',
  stroke: '#818CF8',
  accent: '#0ea5e9',
  up: '#10b981',
  down: '#ef4444',
  grid: 'rgba(0,0,0,0.06)'
};

export default function GoldNowSection({
  rows = [],
  onAppendRows,
  fetchMissingDaysSequential, // o la versión optimizada
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const iso = (d) => d.toISOString().slice(0,10);
  const today = useMemo(() => new Date(new Date().toISOString().slice(0,10)), []); // UTC midnight

  const ordered = useMemo(() => (rows || []).slice().sort((a,b) => +a.date - +b.date), [rows]);
  const lastCsvDate = ordered.length ? ordered[ordered.length-1].date : null;
  const lastClose = ordered.length ? ordered[ordered.length-1].close : null;
  const prevClose = ordered.length > 1 ? ordered[ordered.length-2].close : null;
  const lastDateIso = lastCsvDate ? iso(lastCsvDate) : null;

  const sparkData = useMemo(() => ordered.slice(-60).map(r => ({ t: iso(r.date), v: r.close })), [ordered]);

  // Helpers
  const yearsBetween = (a, b) => Math.max(0.0001, (b - a) / (365.25*24*3600*1000));
  const firstRowOnOrAfter = (d) => ordered.find(r => +r.date >= +d);

  // CAGRs 1971
  const cagrInfo = useMemo(() => {
    if (!ordered.length) return { cagrAdmin: null, cagrMarket: null, bases: {} };
    const endRow = ordered[ordered.length-1]; const end = endRow.close;
    if (!Number.isFinite(end)) return { cagrAdmin: null, cagrMarket: null, bases: {} };

    // 1971-08-15 con Pini=35 (paridad administrada)
    const BASE_ADMIN_DATE = new Date(Date.UTC(1971, 7, 15));
    const P_ADMIN = 35;
    const nAdmin = yearsBetween(BASE_ADMIN_DATE, endRow.date);
    const cagrAdmin = Math.pow(end / Math.max(P_ADMIN, 1e-9), 1/nAdmin) - 1;

    // 1971-08-16 con Pini = primer cierre >= 1971-08-16 (fallback 43.40)
    const BASE_MKT_DATE = new Date(Date.UTC(1971, 7, 16));
    const baseRow = firstRowOnOrAfter(BASE_MKT_DATE);
    const P_MARKET = Number.isFinite(baseRow?.close) ? baseRow.close : 43.40;
    const baseDateUsed = baseRow?.date || BASE_MKT_DATE;
    const nMarket = yearsBetween(baseDateUsed, endRow.date);
    const cagrMarket = Math.pow(end / Math.max(P_MARKET, 1e-9), 1/nMarket) - 1;

    return { cagrAdmin, cagrMarket };
  }, [ordered]);

  // Días faltantes hasta hoy (auto-update al montar)
  const gapsToToday = useMemo(() => {
    if (!lastCsvDate) return [];
    const days = [];
    for (let d = new Date(new Date(lastCsvDate).getTime() + 86400000); d <= today; d = new Date(d.getTime() + 86400000)) {
      days.push(iso(d));
    }
    return days;
  }, [lastCsvDate, today]);

  const canFetch = typeof fetchMissingDaysSequential === 'function';

  const updateNow = useCallback(async () => {
    if (!canFetch || !gapsToToday.length) { setLastFetchedAt(new Date()); return; }
    setLoading(true); setError('');
    try {
      const rowsNew = await fetchMissingDaysSequential(gapsToToday);
      if (rowsNew?.length && typeof onAppendRows === 'function') {
        onAppendRows(rowsNew); // el padre también persistirá en GitHub
      }
      setLastFetchedAt(new Date());
    } catch (e) {
      setError(e?.message || 'No se pudo actualizar desde Metals API');
    } finally { setLoading(false); }
  }, [gapsToToday, onAppendRows, canFetch]);

  useEffect(() => { updateNow(); /* auto */ }, []); // eslint-disable-line

  const liveClose = lastClose;
  const delta = (Number.isFinite(liveClose) && Number.isFinite(prevClose)) ? (liveClose - prevClose) : null;
  const deltaPct = (Number.isFinite(liveClose) && Number.isFinite(prevClose) && prevClose !== 0)
    ? (liveClose/prevClose - 1) : null;

  return (
    <section className="rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)] p-4">
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

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold tracking-tight">
              {Number.isFinite(liveClose) ? liveClose.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—'}
            </div>
            {Number.isFinite(delta) && (
              <span className={`text-sm font-medium ${delta>=0?'text-emerald-600':'text-rose-600'}`}>
                {delta>=0?'+':''}{delta.toFixed(2)} ({deltaPct>=0?'+':''}{(deltaPct*100).toFixed(2)}%)
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {`Hoy ${iso(today)} · ${lastDateIso ? `último dato CSV: ${lastDateIso}` : ''}`} {lastFetchedAt && `· actualizado ${lastFetchedAt.toLocaleTimeString()}`}
            {!canFetch && <span className="ml-2 text-amber-700">(API no disponible en este entorno)</span>}
          </div>
        </div>

        {/* Chips liquid glass para CAGRs */}
        <div className="flex items-start justify-end gap-2">
          <GlassChip label="CAGR 1971 (35 USD)" value={cagrInfo.cagrAdmin!=null ? `${(cagrInfo.cagrAdmin*100).toFixed(2)}%` : '—'} tone={cagrInfo.cagrAdmin!=null ? (cagrInfo.cagrAdmin>=0?'pos':'neg') : 'neutral'} />
          <GlassChip label="CAGR 1971 (1er cierre)" value={cagrInfo.cagrMarket!=null ? `${(cagrInfo.cagrMarket*100).toFixed(2)}%` : '—'} tone={cagrInfo.cagrMarket!=null ? (cagrInfo.cagrMarket>=0?'pos':'neg') : 'neutral'} />
        </div>
      </div>

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
        <div className="text-right font-semibold text-gray-900/90">{Number.isFinite(v)? Number(v).toLocaleString('es-ES'):'—'}</div>
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/30 rounded-2xl" />
    </div>
  );
}
