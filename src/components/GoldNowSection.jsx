// src/components/GoldNowSection.jsx
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

// ===================== SPOT via serverless =====================
/**
 * Obtiene el último precio disponible (aprox. spot) de oro llamando a la función
 * serverless metalprices. Para cumplir las restricciones de Metals‑API, siempre
 * consulta el día de ayer, no la fecha actual.
 */
async function fetchSpotLatestRobust() {
  const SYM = CONFIG.SYMBOL || 'XAUUSD';
  // Calcular fecha de ayer en formato ISO (YYYY-MM-DD)
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  const isoDate = d.toISOString().slice(0, 10);
  // Construir URL hacia la función metalprices
  const url = new URL('/.netlify/functions/metalprices', window.location.origin);
  url.searchParams.set('from', isoDate);
  url.searchParams.set('to', isoDate);
  url.searchParams.set('symbol', SYM);
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => null);
  // Comprobar validez de la respuesta
  if (!res.ok || !data || !data.ok || !Array.isArray(data.rows) || !data.rows.length) {
    throw new Error(data?.error || 'Spot no disponible');
  }
  const row = data.rows[data.rows.length - 1];
  const price = Number(row.close);
  const ts    = new Date(row.date + 'T00:00:00Z').getTime();
  if (!Number.isFinite(price) || price <= 0) throw new Error('Spot no válido');
  return { price, ts };
}

// Paleta de colores del gráfico
const PALETTE = {
  fill: '#C7D2FE',
  stroke: '#818CF8',
  up: '#10b981',
  down: '#ef4444',
  grid: 'rgba(0,0,0,0.06)',
};

/**
 * Componente principal que muestra la sección de “Ahora” con el precio de oro,
 * los datos históricos, las variaciones diarias y los botones de actualización.
 */
export default function GoldNowSection({
  rows = [],
  onAppendRows,
  fetchMissingDaysSequential, // vendrá desde el padre
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const [spot, setSpot] = useState(null);
  const [spotTs, setSpotTs] = useState(null);
  const [spotErr, setSpotErr] = useState('');

  // Formatea un Date a ISO (YYYY-MM-DD)
  const iso = d => d.toISOString().slice(0, 10);
  const today = useMemo(() => new Date(new Date().toISOString().slice(0, 10)), []);
  const yesterday = useMemo(() => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }, [today]);

  // Ordenar las filas por fecha ascendente
  const ordered = useMemo(() => (rows || []).slice().sort((a,b) => +a.date - +b.date), [rows]);
  const lastCsvDate = ordered.length ? ordered[ordered.length - 1].date : null;
  const lastClose   = ordered.length ? ordered[ordered.length - 1].close : null;
  const prevClose   = ordered.length > 1 ? ordered[ordered.length - 2].close : null;
  const lastDateIso = lastCsvDate ? iso(lastCsvDate) : null;

  // Datos para el mini gráfico de la derecha (últimos 60 días)
  const sparkData = useMemo(
    () => ordered.slice(-60).map(r => ({ t: iso(r.date), v: r.close })),
    [ordered]
  );

  // ===== Helpers para CAGRs =====
  const yearsBetween = (a,b) => Math.max(0.0001, (b - a) / (365.25 * 24 * 3600 * 1000));
  const firstRowOnOrAfter = d => ordered.find(r => +r.date >= +d);

  const { cagrAdmin, cagrMarket } = useMemo(() => {
    const endPrice = Number.isFinite(spot) ? spot : Number.isFinite(lastClose) ? lastClose : NaN;
    const endDate  = Number.isFinite(spot) && spotTs
      ? spotTs
      : ordered.length
        ? ordered[ordered.length - 1].date
        : today;
    if (!Number.isFinite(endPrice)) return { cagrAdmin: null, cagrMarket: null };

    const BASE_ADMIN_DATE = new Date(Date.UTC(1971, 7, 15));
    const nAdmin = yearsBetween(BASE_ADMIN_DATE, endDate);
    const cagrAdmin = Math.pow(endPrice / 35, 1/nAdmin) - 1;

    const BASE_MKT_DATE = new Date(Date.UTC(1971, 7, 16));
    const baseRow = firstRowOnOrAfter(BASE_MKT_DATE);
    const P_MARKET = Number.isFinite(baseRow?.close) ? baseRow.close : 43.40;
    const baseDateUsed = baseRow?.date || BASE_MKT_DATE;
    const nMarket = yearsBetween(baseDateUsed, endDate);
    const cagrMarket = Math.pow(endPrice / Math.max(P_MARKET,1e-9), 1/nMarket) - 1;

    return { cagrAdmin, cagrMarket };
  }, [ordered, spot, spotTs, today]);

  /**
   * Calcula qué días faltan entre la última fecha del CSV y ayer. Devuelve un
   * array de cadenas ISO (YYYY-MM-DD). Si no falta ningún día, devuelve [].
   */
  const gapsToYesterday = useMemo(() => {
    if (!lastCsvDate) return [];
    const days = [];
    for (let d = new Date(new Date(lastCsvDate).getTime() + 86400000);
         d <= yesterday;
         d = new Date(d.getTime() + 86400000)) {
      days.push(iso(d));
    }
    return days;
  }, [lastCsvDate, yesterday]);

  // Flag para saber si podemos pedir filas nuevas
  const canFetch = typeof fetchMissingDaysSequential === 'function';

  /**
   * Refresca el spot consultando la función serverless. Si hay error,
   * actualiza el estado spotErr.
   */
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

  /**
   * Maneja el clic en “Actualizar ahora”. Actualiza el spot y, si faltan días
   * en el CSV, los pide mediante fetchMissingDaysSequential() y los añade.
   */
  const updateNow = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await refreshSpot();
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

  // Al montar el componente, solicitar datos al instante
  useEffect(() => { updateNow(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Refrescar sólo el spot cada minuto
  useEffect(() => {
    const id = setInterval(refreshSpot, 60_000);
    return () => clearInterval(id);
  }, [refreshSpot]);

  // Datos derivados para la UI
  const displayPrice = Number.isFinite(spot) ? spot : Number.isFinite(lastClose) ? lastClose : null;
  const delta = Number.isFinite(lastClose) && Number.isFinite(prevClose) ? lastClose - prevClose : null;
  const deltaPct = Number.isFinite(lastClose) && Number.isFinite(prevClose) && prevClose !== 0
    ? lastClose/prevClose - 1
    : null;

  return (
    <div className="border rounded-lg p-4">
      {/* Encabezado con botón de refresco */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Últimos datos del oro</h2>
        <button
          onClick={updateNow}
          className="flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          disabled={loading}
        >
          <RefreshCcw className="w-4 h-4 mr-1" />
          {loading ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      </div>

      {/* Sección principal: precio y variaciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-2xl font-bold">
            {Number.isFinite(displayPrice)
              ? displayPrice.toLocaleString('es-ES', { maximumFractionDigits: 2 })
              : '—'}
          </div>
          {Number.isFinite(delta) && (
            <div className={`text-sm ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(2)} ({(deltaPct * 100).toFixed(2)}%)
            </div>
          )}
          {spotErr && <div className="text-sm text-rose-600">{spotErr}</div>}
        </div>
        <div className="mt-4 sm:mt-0">
          {/* Mini gráfico de los últimos 60 días */}
          <ResponsiveContainer width={200} height={80}>
            <AreaChart data={sparkData}>
              <CartesianGrid stroke={PALETTE.grid} strokeDasharray="3 3" />
              <XAxis dataKey="t" hide />
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Area
                type="monotone"
                dataKey="v"
                stroke={PALETTE.stroke}
                fill={PALETTE.fill}
                fillOpacity={0.4}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sección de CAGRs */}
      <div className="mt-4 flex space-x-4">
        <div>
          <div className="text-sm text-gray-500">CAGR Admin (desde 1971-08-15)</div>
          <div className="text-lg font-medium">
            {Number.isFinite(cagrAdmin) ? (cagrAdmin * 100).toFixed(2) + '%' : '—'}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">CAGR Market (desde 1971-08-16)</div>
          <div className="text-lg font-medium">
            {Number.isFinite(cagrMarket) ? (cagrMarket * 100).toFixed(2) + '%' : '—'}
          </div>
        </div>
        {lastFetchedAt && (
          <div className="text-sm text-gray-500">Actualizado: {lastFetchedAt.toLocaleString('es-ES')}</div>
        )}
      </div>

      {/* Mostrar errores generales (distintos de spotErr) */}
      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
    </div>
  );
}
