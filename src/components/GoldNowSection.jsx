'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ReferenceLine,
} from 'recharts';
import { RefreshCcw } from 'lucide-react';
import { CONFIG } from '../config.js';

/* ====== SPOT desde serverless: consulta /.netlify/functions/metalprices ====== */
async function fetchSpotLatestRobust() {
  const SYM = CONFIG.SYMBOL || 'XAUUSD';
  const todayIso = new Date().toISOString().slice(0, 10);
  const url = new URL('/.netlify/functions/metalprices', window.location.origin);
  url.searchParams.set('from', todayIso);
  url.searchParams.set('to', todayIso);
  url.searchParams.set('symbol', SYM);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok || !Array.isArray(data.rows) || !data.rows.length) {
    throw new Error(data?.error || 'Spot no disponible');
  }
  const row = data.rows[data.rows.length - 1];
  const price = Number(row.close);
  const ts    = new Date(row.date + 'T00:00:00Z').getTime();
  if (!Number.isFinite(price) || price <= 0) throw new Error('Spot no válido');
  return { price, ts };
}

/* ====== Paleta de colores ====== */
const PALETTE = {
  fill: '#C7D2FE',
  stroke: '#818CF8',
  up: '#10b981',
  down: '#ef4444',
  grid: 'rgba(0,0,0,0.06)',
};

/* ====== Componente ====== */
export default function GoldNowSection({
  rows = [],
  onAppendRows,
  fetchMissingDaysSequential, // la versión optimizada vendrá del componente padre
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const [spot, setSpot] = useState(null);
  const [spotTs, setSpotTs] = useState(null);
  const [spotErr, setSpotErr] = useState('');

  const iso = (d) => d.toISOString().slice(0, 10);
  const today = useMemo(() => new Date(new Date().toISOString().slice(0, 10)), []); // UTC midnight
  const yesterday = useMemo(() => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }, [today]);

  const ordered = useMemo(() => (rows || []).slice().sort((a, b) => +a.date - +b.date), [rows]);
  const lastCsvDate = ordered.length ? ordered[ordered.length - 1].date : null;
  const lastClose   = ordered.length ? ordered[ordered.length - 1].close : null;
  const prevClose   = ordered.length > 1 ? ordered[ordered.length - 2].close : null;
  const lastDateIso = lastCsvDate ? iso(lastCsvDate) : null;

  const sparkData = useMemo(
    () => ordered.slice(-60).map((r) => ({ t: iso(r.date), v: r.close })),
    [ordered]
  );

  // Helpers para CAGRs
  const yearsBetween = (a, b) => Math.max(0.0001, (b - a) / (365.25 * 24 * 3600 * 1000));
  const firstRowOnOrAfter = (d) => ordered.find((r) => +r.date >= +d);

  // CAGRs 1971 usando spot si existe
  const { cagrAdmin, cagrMarket } = useMemo(() => {
    const endPrice = Number.isFinite(spot) ? spot : Number.isFinite(lastClose) ? lastClose : NaN;
    const endDate  = Number.isFinite(spot) && spotTs ? spotTs : ordered.length ? ordered[ordered.length - 1].date : today;

    if (!Number.isFinite(endPrice)) return { cagrAdmin: null, cagrMarket: null };

    // Paridad administrada (35 USD) a 1971-08-15
    const BASE_ADMIN_DATE = new Date(Date.UTC(1971, 7, 15));
    const nAdmin = yearsBetween(BASE_ADMIN_DATE, endDate);
    const cagrAdmin = Math.pow(endPrice / 35, 1 / nAdmin) - 1;

    // Mercado libre a partir de 1971-08-16
    const BASE_MKT_DATE = new Date(Date.UTC(1971, 7, 16));
    const baseRow = firstRowOnOrAfter(BASE_MKT_DATE);
    const P_MARKET = Number.isFinite(baseRow?.close) ? baseRow.close : 43.40;
    const baseDateUsed = baseRow?.date || BASE_MKT_DATE;
    const nMarket = yearsBetween(baseDateUsed, endDate);
    const cagrMarket = Math.pow(endPrice / Math.max(P_MARKET, 1e-9), 1 / nMarket) - 1;

    return { cagrAdmin, cagrMarket };
  }, [ordered, spot, spotTs, today]);

  // Días faltantes hasta AYER
  const gapsToYesterday = useMemo(() => {
    if (!lastCsvDate) return [];
    const days = [];
    for (
      let d = new Date(new Date(lastCsvDate).getTime() + 86400000);
      d <= yesterday;
      d = new Date(d.getTime() + 86400000)
    ) {
      days.push(iso(d));
    }
    return days;
  }, [lastCsvDate, yesterday]);

  const canFetch = typeof fetchMissingDaysSequential === 'function';

  // Spot: refresca el precio actual
  const refreshSpot = useCallback(async () => {
    try {
      const { price, ts } = await fetchSpotLatestRobust();
      setSpot(price);
      setSpotTs(new Date(ts));
      setSpotErr('');
    } catch (e) {
      setSpotErr(String(e?.message || e));
    }
  }, []);

  // Botón: Spot + OHLC hasta AYER
  const updateNow = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await refreshSpot(); // spot al instante
      if (canFetch && gapsToYesterday.length) {
        const rowsNew = await fetchMissingDaysSequential(gapsToYesterday);
        if (rowsNew?.length && typeof onAppendRows === 'function') onAppendRows(rowsNew);
      }
      setLastFetchedAt(new Date());
    } catch (e) {
      setError(e?.message || 'No se pudo actualizar');
    } finally {
      setLoading(false);
    }
  }, [refreshSpot, canFetch, gapsToYesterday, onAppendRows]);

  // Auto: rellena huecos y primer spot al montar
  useEffect(() => {
    updateNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling: actualiza spot cada 60s
  useEffect(() => {
    const id = setInterval(refreshSpot, 60_000);
    return () => clearInterval(id);
  }, [refreshSpot]);

  // Cálculo de variación
  const displayPrice = Number.isFinite(spot) ? spot : Number.isFinite(lastClose) ? lastClose : null;
  const delta = Number.isFinite(lastClose) && Number.isFinite(prevClose) ? lastClose - prevClose : null;
  const deltaPct = Number.isFinite(lastClose) && Number.isFinite(prevClose) && prevClose !== 0 ? lastClose / prevClose - 1 : null;

  return (
    <section className="rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">Últimos datos del oro</div>
        <button onClick={updateNow} disabled={loading} className="inline-flex items-center gap-2 text-xs rounded-md border px-2 py-1 disabled:opacity-60">
          <RefreshCcw className="w-3.5 h-3.5" />
          {loading ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {/* Precio y variación */}
        <div className="md:col-span-2 space-y-1">
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold tracking-tight">
              {Number.isFinite(displayPrice)
                ? displayPrice.toLocaleString('es-ES', { maximumFractionDigits: 2 })
                : '—'}
            </div>
            {Number.isFinite(delta) && (
              <span className={`text-sm font-medium ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(2)} (
                {deltaPct >= 0 ? '+' : ''}
                {(deltaPct * 100).toFixed(2)}%)
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-500">
            {`Hoy ${iso(today)} · último cierre CSV: ${lastDateIso || '—'}`}
            {spotTs && ` · spot ${spotTs.toLocaleTimeString()}`}
            {spotErr && <span className="ml-2 text-amber-700">(Spot: {spotErr})</span>}
            {lastFetchedAt && ` · OHLC actualizado ${lastFetchedAt.toLocaleTimeString()}`}
          </div>
        </div>

        {/* CAGRs */}
        <div className="flex items-start justify-end gap-2">
          <GlassChip
            label="CAGR 1971 (35 USD)"
            value={cagrAdmin != null ? `${(cagrAdmin * 100).toFixed(2)}%` : '—'}
            tone={cagrAdmin != null ? (cagrAdmin >= 0 ? 'pos' : 'neg') : 'neutral'}
          />
          <GlassChip
            label="CAGR 1971 (1er cierre)"
            value={cagrMarket != null ? `${(cagrMarket * 100).toFixed(2)}%` : '—'}
            tone={cagrMarket != null ? (cagrMarket >= 0 ? 'pos' : 'neg') : 'neutral'}
          />
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

/* ====== UI helpers ====== */
function GlassChip({ label, value, tone = 'neutral' }) {
  const toneClass =
    tone === 'pos' ? 'text-emerald-700' :
    tone === 'neg' ? 'text-rose-700' :
    'text-gray-900/90';
  return (
    <div
      className={`relative rounded-2xl border border-white/30 bg-white/10 text-xs overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.6)] px-3 py-2 ${toneClass}`}
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
        <div className="text-right font-semibold text-gray-900/90">
          {Number.isFinite(v) ? Number(v).toLocaleString('es-ES') : '—'}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/30 rounded-2xl" />
    </div>
  );
}
