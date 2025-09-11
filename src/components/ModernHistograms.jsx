'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Sparkles } from 'lucide-react';

/**
 * ModernHistograms — v6 (paleta sutil + fondo blanco)
 * ---------------------------------------------------
 * Cambios vs v5:
 *  - Fondo 100% blanco (sin blobs/gradientes). Tarjetas limpias con sombra suave.
 *  - Barras con colores **sutiles** y **cohesionados** (sin degradados SVG).
 *  - Tooltip liquid-glass y métricas avanzadas se mantienen.
 */
export default function ModernHistograms({
  monthlyComparative = [],
  years = [],
  dailyMonth = [],
  dailyValueKey = 'range',
  title = 'Comparativa mensual',
  statLabel = 'Media',
  heightMonthly = 360,
  heightDaily = 320,
  // 👇 integración con tu dashboard: click en barra diaria
  onDailyBarClick,
}) {
  // ======= Data guards / demo =======
  const dataMonthly = monthlyComparative?.length ? monthlyComparative : DEMO_MONTHLY;
  const dataDaily = dailyMonth?.length ? dailyMonth : DEMO_DAILY;

  // Infer years if prop is empty
  const inferredYears = useMemo(() => inferYearsFromMonthly(dataMonthly), [dataMonthly]);
  const seriesYears = useMemo(() => (years?.length ? years.map(String) : inferredYears), [years, inferredYears]);

  // Legend visibility state — sync with seriesYears
  const [visible, setVisible] = useState(new Set(seriesYears));
  useEffect(() => { setVisible(new Set(seriesYears)); }, [seriesYears]);

  // Y scales
  const maxMonthly = useMemo(() => getMaxMonthly(dataMonthly, seriesYears), [dataMonthly, seriesYears]);
  const maxDaily = useMemo(() => getMaxDaily(dataDaily, dailyValueKey), [dataDaily, dailyValueKey]);

  // Paleta sutil y cohesionada (sin gradientes)
  const palette = useMemo(() => buildPaletteSolid(seriesYears), [seriesYears]);
  const visibleYears = useMemo(() => seriesYears.filter((y)=>visible.has(y)), [seriesYears, visible]);

  function toggleYear(k) { setVisible((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }

  return (
    <div className="space-y-8">
      {/* ====== Comparativa mensual ====== */}
      <CardWhite>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-black/5"><Sparkles className="w-4 h-4"/></div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          </div>
          <div className="text-xs text-gray-600">Estadístico <span className="inline-flex px-2 py-1 rounded-md bg-indigo-600 text-white ml-2">{statLabel}</span></div>
        </div>

        <div className="w-full relative" style={{ height: heightMonthly, minHeight: heightMonthly }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataMonthly} margin={{ top: 18, right: 24, left: 8, bottom: 8 }}>
              <defs>
                <filter id="dropSoft">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.10)"/>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, Math.ceil(maxMonthly*1.15) || 'auto']} tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={0} stroke="#111" opacity={0.12} />
              <Tooltip
                cursor={false}
                content={<CustomTooltip mode="monthly" context={{ dataMonthly, visibleYears, palette }} formatterLabel={(l)=>`Mes ${l}`} />}
              />
              <Legend content={<LegendPills years={seriesYears} visible={visible} palette={palette} onToggle={toggleYear} />} />

              {seriesYears.map((yr, idx) => (
                <Bar
                  key={yr}
                  dataKey={yr}
                  name={yr}
                  radius={[8, 8, 4, 4]}
                  maxBarSize={28}
                  isAnimationActive
                  animationDuration={600 + idx*120}
                  animationEasing="ease-out"
                  fill={palette?.[yr]?.fill || '#CBD5E1'}
                  stroke={palette?.[yr]?.stroke || '#94A3B8'}
                  strokeWidth={1}
                  opacity={0.95}
                  hide={!visible.has(yr)}
                >
                  {dataMonthly.map((_, i) => (<Cell key={`c-${yr}-${i}`} filter="url(#dropSoft)" />))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardWhite>

      {/* ====== Detalle diario del mes ====== */}
      <CardWhite>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-black/5"><Sparkles className="w-4 h-4"/></div>
            <h3 className="text-lg font-semibold tracking-tight">Detalle del mes (distribución diaria)</h3>
          </div>
        </div>
        <div className="w-full relative" style={{ height: heightDaily, minHeight: heightDaily }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dataDaily}
              margin={{ top: 18, right: 24, left: 8, bottom: 8 }}
              onClick={(st) => {
                const p = st?.activePayload?.[0]?.payload;
                if (p && onDailyBarClick) onDailyBarClick(p);
              }}
            >
              <defs>
                <filter id="dropSoft">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.10)"/>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="day" tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, Math.ceil(maxDaily*1.15) || 'auto']} tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={0} stroke="#111" opacity={0.12} />
              <Tooltip
                cursor={false}
                content={<CustomTooltip mode="daily" context={{ dailyMonth: dataDaily, valueKey: dailyValueKey }} formatterLabel={(l)=>`Día ${l}`} />}
              />
              <Bar dataKey={dailyValueKey} radius={[8, 8, 4, 4]} maxBarSize={32} fill={palette?.[seriesYears[0]]?.fill || '#93C5FD'} stroke={palette?.[seriesYears[0]]?.stroke || '#60A5FA'} strokeWidth={1} isAnimationActive animationDuration={680} animationEasing="ease-out">
                {dataDaily.map((_, i) => (<Cell key={`d-${i}`} filter="url(#dropSoft)" />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardWhite>
    </div>
  );
}

// =================== UI: Cards & Legend ===================
function CardWhite({ children }) {
  return (
    <div className="relative rounded-3xl p-4 sm:p-6 bg-white border border-black/5 shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
      {children}
    </div>
  );
}

function LegendPills({ years, visible, palette, onToggle }) {
  if (!years || !years.length) return null;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {years.map((yr) => (
        <button
          key={yr}
          onClick={() => onToggle?.(yr)}
          aria-pressed={visible?.has?.(yr)}
          className={`px-2.5 py-1 rounded-full border text-xs flex items-center gap-2 transition ${visible?.has?.(yr) ? 'bg-white shadow-sm' : 'bg-gray-50 opacity-60'}`}
          style={{ borderColor: palette?.[yr]?.stroke || '#e5e7eb' }}
        >
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: palette?.[yr]?.fill || '#CBD5E1' }} />
          {yr}
        </button>
      ))}
    </div>
  );
}

// =================== Tooltip (liquid glass con métricas) ===================
function CustomTooltip({ active, payload, label, mode = 'monthly', context = {}, formatterLabel }) {
  if (!active) return null;
  const heading = formatterLabel ? formatterLabel(label) : label;

  const seriesRows = (payload||[]).map((entry, i) => {
    const name = entry.name || entry.dataKey;
    const value = entry.value;
    return (
      <div key={i} className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
        <span className="text-gray-700">{name}</span>
        <span className="ml-auto font-semibold text-gray-900/90">{formatNumber(value)}</span>
      </div>
    );
  });

  let metricsBlock = null;
  if (mode === 'monthly') {
    const { dataMonthly = [], visibleYears = [] } = context;
    const mStats = computeMonthlyTooltipMetrics(label, dataMonthly, visibleYears);
    metricsBlock = (
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-700">
        <Metric label="Total visible" value={formatNumber(mStats.total)} />
        <Metric label="Media" value={formatNumber(mStats.mean)} />
        <Metric label="Mediana" value={formatNumber(mStats.median)} />
        <Metric label="p90 / p95" value={`${formatNumber(mStats.p90)} / ${formatNumber(mStats.p95)}`} />
        <Metric label="Mín / Máx" value={`${formatNumber(mStats.min)} / ${formatNumber(mStats.max)}`} />
        {mStats.yoy != null && (
          <Metric label={`YoY ${mStats.lastYear}→${mStats.prevYear}`} value={`${(mStats.yoy*100).toFixed(1)}%`} tone={mStats.yoy>=0?'pos':'neg'} />
        )}
      </div>
    );
  } else if (mode === 'daily') {
    const { dailyMonth = [], valueKey = 'range' } = context;
    const dStats = computeDailyTooltipMetrics(label, dailyMonth, valueKey);
    metricsBlock = (
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-700">
        <Metric label="Valor del día" value={formatNumber(dStats.value)} />
        <Metric label="Percentil" value={`${Math.round(dStats.percentile*100)}%`} />
        <Metric label="Media / σ" value={`${formatNumber(dStats.mean)} / ${formatNumber(dStats.std)}`} />
        <Metric label="CV" value={`${(dStats.cv*100).toFixed(1)}%`} />
        <Metric label="p90 / p95" value={`${formatNumber(dStats.p90)} / ${formatNumber(dStats.p95)}`} />
        <Metric label="Mín / Máx" value={`${formatNumber(dStats.min)} / ${formatNumber(dStats.max)}`} />
      </div>
    );
  }

  return (
    <div
      className="relative min-w-[200px] rounded-2xl border border-white/30 bg-white/10 text-xs overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.6)]"
      style={{ backdropFilter: 'blur(14px) saturate(170%)', WebkitBackdropFilter: 'blur(14px) saturate(170%)' }}
    >
      <div className="relative p-3">
        <div className="font-medium mb-1 text-gray-900/90">{heading}</div>
        <div className="grid grid-cols-1 gap-1">{seriesRows}</div>
        <div className="my-2 h-px bg-white/50" />
        {metricsBlock}
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/30 rounded-2xl" />
    </div>
  );
}

function Metric({label, value, tone}){
  const toneCls = tone==='pos' ? 'text-emerald-700' : tone==='neg' ? 'text-rose-700' : 'text-gray-900/90';
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-600">{label}</span>
      <span className={`ml-auto font-semibold ${toneCls}`}>{value}</span>
    </div>
  );
}

// =================== Stats helpers ===================
function inferYearsFromMonthly(rows) {
  if (!rows || !rows.length) return [];
  const keys = Object.keys(rows[0]);
  const years = keys.filter((k) => /^(19|20)\d{2}$/.test(k));
  return years;
}
function getMaxMonthly(rows, years){ let m = 0; for(const r of rows){ for(const y of years){ const v=Number(r[y]); if(Number.isFinite(v)&&v>m)m=v; } } return m; }
function getMaxDaily(rows, key){ let m = 0; for(const r of rows){ const v=Number(r[key]); if(Number.isFinite(v)&&v>m)m=v; } return m; }
function formatNumber(x){ const n=Number(x); if(!Number.isFinite(n)) return '—'; if(Math.abs(n)>=1000) return n.toLocaleString('es-ES'); return n.toFixed(0); }
function statsFromArray(arr){ const a = arr.filter(Number.isFinite).slice().sort((x,y)=>x-y); const n = a.length; if(!n) return {n:0, mean:0, median:0, p90:0, p95:0, min:0, max:0, std:0, cv:0}; const sum = a.reduce((s,x)=>s+x,0); const mean=sum/n; const median=quantile(a,0.5); const p90=quantile(a,0.90); const p95=quantile(a,0.95); const min=a[0]; const max=a[n-1]; const variance = a.reduce((s,x)=>s+(x-mean)*(x-mean),0)/n; const std=Math.sqrt(variance); const cv=mean!==0?std/mean:0; return {n, mean, median, p90, p95, min, max, std, cv}; }
function quantile(sortedAsc, q){ const n=sortedAsc.length; if(!n) return 0; const pos=(n-1)*q; const b=Math.floor(pos); const r=pos-b; return sortedAsc[b+1]!==undefined? sortedAsc[b]+r*(sortedAsc[b+1]-sortedAsc[b]) : sortedAsc[b]; }
function percentileRank(sortedAsc, value){ if(!sortedAsc.length) return 0; let i=0; while(i<sortedAsc.length && sortedAsc[i]<=value) i++; if(sortedAsc.length===1) return 1; return (i-1)/(sortedAsc.length-1); }
function computeMonthlyTooltipMetrics(monthKey, rows, years){ const row = rows.find(r=>String(r.month)===String(monthKey)); const vals = years.map(y=>Number(row?.[y])).filter(Number.isFinite); const stats = statsFromArray(vals); const yearsPresent = years.filter(y=>Number.isFinite(row?.[y])).sort(); const last = yearsPresent[yearsPresent.length-1]; const prev = yearsPresent.length>1 ? yearsPresent[yearsPresent.length-2] : null; let yoy = null; if(last && prev && Number(row[prev])!==0){ yoy = (Number(row[last])-Number(row[prev]))/Number(row[prev]); } return { total: vals.reduce((s,x)=>s+x,0), ...stats, yoy, lastYear:last, prevYear:prev }; }
function computeDailyTooltipMetrics(dayLabel, rows, key){ const value = Number((rows.find(r=>String(r.day)===String(dayLabel))||{})[key]); const arr = rows.map(r=>Number(r[key])).filter(Number.isFinite).sort((a,b)=>a-b); const stats = statsFromArray(arr); const perc = percentileRank(arr, value); return { value, percentile: perc, ...stats }; }

function buildPaletteSolid(years){
  // Gama cohesionada, suave (sin gradientes)
  const base = [
    { fill: '#C7D2FE', stroke: '#818CF8' }, // indigo light
    { fill: '#BAE6FD', stroke: '#7DD3FC' }, // sky light
    { fill: '#BBF7D0', stroke: '#34D399' }, // green mint
    { fill: '#FDE68A', stroke: '#F59E0B' }, // amber soft
    { fill: '#FBCFE8', stroke: '#EC4899' }, // pink soft
    { fill: '#E9D5FF', stroke: '#A78BFA' }, // violet soft
  ];
  const out = {}; years.forEach((yr, i) => { out[yr] = base[i % base.length]; }); return out;
}

// =================== Demo data ===================
const DEMO_MONTHLY = Array.from({length:12}, (_,i)=>({
  month: String(i+1).padStart(2,'0'),
  '2023': Math.round(15 + Math.random()*45),
  '2024': Math.round(15 + Math.random()*45),
  '2025': Math.round(15 + Math.random()*45),
}));
const DEMO_DAILY = Array.from({length:9}, (_,i)=>({ day: i+1, range: Math.round(30 + Math.random()*40) }));

// =================== Dev mini-tests ===================
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.groupCollapsed('[ModernHistograms v6 tests]');
  const arr=[1,2,3,4,5]; const s=statsFromArray(arr); console.assert(s.median===3 && s.p95>=s.p90, 'stats order');
  const m=computeMonthlyTooltipMetrics('01', [{month:'01','2024':10,'2025':20}], ['2024','2025']); console.assert(m.total===30 && m.mean===15, 'monthly tooltip metrics');
  const d=computeDailyTooltipMetrics(1, [{day:1,range:10},{day:2,range:20}], 'range'); console.assert(d.value===10 && d.min===10, 'daily tooltip metrics');
  console.groupEnd();
}
