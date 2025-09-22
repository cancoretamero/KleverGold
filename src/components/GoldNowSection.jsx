// @ts-check
/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
import { fetchSpotPrice } from '../api.js';

/**
 * Widget “Últimos datos del oro”
 *
 * Este componente muestra el último precio del oro, la variación diaria y
 * calcula el CAGR histórico desde 1971. Utiliza las filas ya cargadas del CSV
 * (prop `rows`) y, si es necesario, rellena los huecos hasta la fecha actual usando
 * `fetchMissingDaysSequential`. También obtiene el precio spot más reciente
 * a través del backend Express configurado para KleverGold.
 */

// Paleta de colores para la gráfica y los indicadores. Mantiene la estética original.
const PALETTE = {
  fill: '#C7D2FE',     // indigo‑200
  stroke: '#818CF8',   // indigo‑400
  accent: '#0ea5e9',   // sky‑500
  up: '#10b981',       // emerald‑500
  down: '#ef4444',     // rose‑500
  grid: 'rgba(0,0,0,0.06)',
};

/* ===================== Componente GoldNowSection ===================== */

export default function GoldNowSection({ rows = [], onAppendRows, fetchMissingDaysSequential }) {
  // Estado de carga y error para las llamadas al backend
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  // Estado para el precio spot
  const [spot, setSpot] = useState(null);
  const [spotTs, setSpotTs] = useState(null);
  const [spotBid, setSpotBid] = useState(null);
  const [spotAsk, setSpotAsk] = useState(null);
  const [spotErr, setSpotErr] = useState('');

  // Formatea un Date a ISO (YYYY‑MM‑DD)
  const iso = useCallback((d) => d.toISOString().slice(0, 10), []);
  // Hoy a medianoche UTC
  const today = useMemo(() => new Date(new Date().toISOString().slice(0, 10)), []);

  // Ordenar las filas entrantes por fecha ascendente
  const ordered = useMemo(() => (rows || []).slice().sort((a, b) => +a.date - +b.date), [rows]);
  const lastCsvDate = ordered.length ? ordered[ordered.length - 1].date : null;
  const lastClose = ordered.length ? ordered[ordered.length - 1].close : null;
  const prevClose = ordered.length > 1 ? ordered[ordered.length - 2].close : null;
  const lastDateIso = lastCsvDate ? iso(lastCsvDate) : null;

  // Datos para el mini gráfico (últimos 60 días)
  const sparkData = useMemo(
    () => ordered.slice(-60).map((r) => ({ t: iso(r.date), v: r.close })),
    [ordered, iso],
  );

  // Helpers para CAGR
  const yearsBetween = useCallback((a, b) => Math.max(0.0001, (b - a) / (365.25 * 24 * 3600 * 1000)), []);
  const firstRowOnOrAfter = useCallback((d) => ordered.find((r) => +r.date >= +d), [ordered]);

  // Calcular CAGRs (Admin y Market). Usa el spot si está disponible como precio y fecha final.
  const cagrInfo = useMemo(() => {
    if (!ordered.length) return { cagrAdmin: null, cagrMarket: null };
    const endPrice = Number.isFinite(spot) ? spot : lastClose;
    const endDate = Number.isFinite(spot) && spotTs instanceof Date ? spotTs : lastCsvDate;
    if (!Number.isFinite(endPrice) || !endDate) return { cagrAdmin: null, cagrMarket: null };
    // Paridad administrada: 1971‑08‑15, Pini=35 USD/oz
    const BASE_ADMIN_DATE = new Date(Date.UTC(1971, 7, 15));
    const P_ADMIN = 35;
    const nAdmin = yearsBetween(BASE_ADMIN_DATE, endDate);
    const cagrAdmin = Math.pow(endPrice / Math.max(P_ADMIN, 1e-9), 1 / nAdmin) - 1;
    // Mercado libre: 1971‑08‑16, Pini = primer cierre >= esa fecha o fallback 43.40
    const BASE_MKT_DATE = new Date(Date.UTC(1971, 7, 16));
    const baseRow = firstRowOnOrAfter(BASE_MKT_DATE);
    const P_MARKET = Number.isFinite(baseRow?.close) ? baseRow.close : 43.40;
    const baseDateUsed = baseRow?.date || BASE_MKT_DATE;
    const nMarket = yearsBetween(baseDateUsed, endDate);
    const cagrMarket = Math.pow(endPrice / Math.max(P_MARKET, 1e-9), 1 / nMarket) - 1;
    return { cagrAdmin, cagrMarket };
  }, [ordered, spot, spotTs, lastClose, lastCsvDate, yearsBetween, firstRowOnOrAfter]);

  // Determinar qué días faltan entre la última fecha del CSV y HOY
  const gapsToToday = useMemo(() => {
    if (!lastCsvDate) return [];
    const days = [];
    for (
      let d = new Date(lastCsvDate.getTime() + 86400000);
      d <= today;
      d = new Date(d.getTime() + 86400000)
    ) {
      days.push(iso(d));
    }
    return days;
  }, [lastCsvDate, today, iso]);

  const gapsSignature = useMemo(() => gapsToToday.join('|'), [gapsToToday]);
  const autoFillRef = useRef('');

  // Puede el padre pedir los días faltantes
  const canFetch = typeof fetchMissingDaysSequential === 'function';

  /**
   * Pide el precio spot al backend Express y actualiza
   * `spot`, `spotTs` y `spotErr` según corresponda.
   */
  const refreshSpot = useCallback(async () => {
    try {
      const { price, ts, bid, ask } = await fetchSpotPrice();
      setSpot(price);
      setSpotTs(ts instanceof Date ? ts : new Date(ts));
      setSpotBid(Number.isFinite(bid) ? bid : null);
      setSpotAsk(Number.isFinite(ask) ? ask : null);
      setSpotErr('');
    } catch (e) {
      setSpot(null);
      setSpotTs(null);
      setSpotBid(null);
      setSpotAsk(null);
      setSpotErr(String(e?.message || e));
    }
  }, []);

  /**
   * Acciona la actualización manual: refresca el spot e intenta
   * rellenar los huecos hasta HOY. Marca la hora de la actualización.
   */
  const updateNow = useCallback(async (options = {}) => {
    const { forceFill = false } = options ?? {}
    setLoading(true);
    setError('');
    try {
      // Siempre intenta obtener el spot antes de rellenar huecos
      await refreshSpot();
      // Si hay días faltantes y el padre nos permite pedirlos
      if (canFetch && gapsToToday.length) {
        const rowsNew = await fetchMissingDaysSequential(gapsToToday, { force: forceFill });
        if (rowsNew?.length && typeof onAppendRows === 'function') {
          onAppendRows(rowsNew);
        }
      }
      setLastFetchedAt(new Date());
    } catch (e) {
      setError(e?.message || 'No se pudo actualizar');
    } finally {
      setLoading(false);
    }
  }, [refreshSpot, canFetch, gapsToToday, onAppendRows, fetchMissingDaysSequential]);

  // Al montar el componente: refrescar spot y rellenar huecos si procede
  useEffect(() => {
    updateNow();
  }, []);

  useEffect(() => {
    if (!canFetch) return;
    if (!gapsSignature) return;
    if (autoFillRef.current === gapsSignature) return;
    autoFillRef.current = gapsSignature;
    updateNow();
  }, [canFetch, gapsSignature, updateNow]);

  // Polling para refrescar sólo el spot cada 60 segundos
  useEffect(() => {
    const id = setInterval(() => {
      refreshSpot();
    }, 60_000);
    return () => clearInterval(id);
  }, [refreshSpot]);

  // Precio a mostrar: primero spot, luego último cierre disponible
  const displayPrice = Number.isFinite(spot) ? spot : Number.isFinite(lastClose) ? lastClose : null;
  // Diferencias diarias basadas en cierres del CSV
  const delta = Number.isFinite(lastClose) && Number.isFinite(prevClose) ? lastClose - prevClose : null;
  const deltaPct =
    Number.isFinite(lastClose) && Number.isFinite(prevClose) && prevClose !== 0
      ? lastClose / prevClose - 1
      : null;

  return (
    <section className="rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">Últimos datos del oro</div>
        <button
          onClick={() => updateNow({ forceFill: true })}
          disabled={loading}
          className="inline-flex items-center gap-2 text-xs rounded-md border px-2 py-1 disabled:opacity-60"
        >
          <RefreshCcw className="w-3.5 h-3.5" />{' '}
          {loading ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex items-end gap-3">
            <div className="text-3xl font-bold tracking-tight">
              {Number.isFinite(displayPrice)
                ? displayPrice.toLocaleString('es-ES', { maximumFractionDigits: 2 })
                : '—'}
            </div>
            {Number.isFinite(delta) && (
              <span className={`text-sm font-medium ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(2)} ({deltaPct >= 0 ? '+' : ''}
                {(deltaPct * 100).toFixed(2)}%)
              </span>
            )}
          </div>
          {Number.isFinite(spotBid) || Number.isFinite(spotAsk) ? (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
              {Number.isFinite(spotBid) && (
                <span>
                  Compra (bid):{' '}
                  <span className="font-medium text-gray-700">
                    {spotBid.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                  </span>
                </span>
              )}
              {Number.isFinite(spotAsk) && (
                <span>
                  Venta (ask):{' '}
                  <span className="font-medium text-gray-700">
                    {spotAsk.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                  </span>
                </span>
              )}
            </div>
          ) : null}
          <div className="text-[11px] text-gray-500 mt-1">
            {`Hoy ${iso(today)}`}
            {lastDateIso ? ` · último cierre CSV: ${lastDateIso}` : ''}
            {spotTs instanceof Date ? ` · spot ${spotTs.toLocaleTimeString()}` : ''}
            {lastFetchedAt ? ` · OHLC actualizado ${lastFetchedAt.toLocaleTimeString()}` : ''}
            {!canFetch && (
              <span className="ml-2 text-amber-700">(API no disponible en este entorno)</span>
            )}
            {spotErr && (
              <span className="ml-2 text-amber-700">(Spot: {spotErr})</span>
            )}
          </div>
        </div>

        {/* Chips de CAGR con efecto "glass" */}
        <div className="flex items-start justify-end gap-2">
          <GlassChip
            label="CAGR 1971 (35 USD)"
            value={
              cagrInfo.cagrAdmin != null
                ? `${(cagrInfo.cagrAdmin * 100).toFixed(2)}%`
                : '—'
            }
            tone={
              cagrInfo.cagrAdmin != null
                ? cagrInfo.cagrAdmin >= 0
                  ? 'pos'
                  : 'neg'
                : 'neutral'
            }
          />
          <GlassChip
            label="CAGR 1971 (1er cierre)"
            value={
              cagrInfo.cagrMarket != null
                ? `${(cagrInfo.cagrMarket * 100).toFixed(2)}%`
                : '—'
            }
            tone={
              cagrInfo.cagrMarket != null
                ? cagrInfo.cagrMarket >= 0
                  ? 'pos'
                  : 'neg'
                : 'neutral'
            }
          />
        </div>
      </div>

      {/* Sparkline de los últimos 60 días */}
      <div className="mt-4 h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 6" stroke={PALETTE.grid} />
            <XAxis
              dataKey="t"
              tick={{ fill: '#111', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              tick={{ fill: '#111', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <ReferenceLine y={0} stroke="#111" opacity={0.1} />
            <RTooltip cursor={false} content={<SparkGlassTooltip />} />
            <Area
              type="monotone"
              dataKey="v"
              stroke={PALETTE.stroke}
              strokeWidth={1.6}
              fill={PALETTE.fill + '66'}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {error && <div className="mt-2 text-xs text-rose-700">{error}</div>}
    </section>
  );
}

/* ============ UI helper components ============ */

/**
 * Un chip con efecto glass para mostrar valores como el CAGR. Cambia de color
 * según el tono (positivo, negativo o neutro).
 */
function GlassChip({ label, value, tone = 'neutral' }) {
  const toneCls =
    tone === 'pos'
      ? 'text-emerald-700'
      : tone === 'neg'
      ? 'text-rose-700'
      : 'text-gray-900/90';
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

/**
 * Tooltip personalizado para la sparkline. Usa efecto glass y muestra fecha y valor.
 */
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
