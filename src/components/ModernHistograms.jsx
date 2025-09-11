'use client';

import React, { useMemo, useState, useEffect } from 'react';
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
 * ModernHistograms — v7 (funcional)
 * ---------------------------------------------------
 * - “Estadístico” funciona (Media/Mediana) y recalcula la comparativa.
 * - “Detalle del mes” muestra la distribución diaria para TODOS los años seleccionados,
 *   con selector de mes (pills 01..12) y pills de años para activar/desactivar.
 * - Mantiene estética v6 (fondo blanco, paleta sutil, tooltips liquid-glass).
 *
 * Props:
 *  - rawRows?: Array<{date:Date, year:number, month:number, day?:number, range:number,...}>
 *  - monthlyComparative?: Array (fallback si no hay rawRows)
 *  - years: number[]                           // años seleccionados en tu UI
 *  - title?: string                            // por defecto “Comparativa anual”
 *  - initialMonth?: number (1..12)             // mes inicial del detalle
 *  - dailyValueKey?: string                    // campo a usar en detalle (‘range’)
 *  - stat?: 'avg'|'median'                     // estado enlazado con el padre (opcional)
 *  - onStatChange?: (v)=>void                  // callback para el padre (opcional)
 *  - onDailyBarClick?: (payload)=>void
 */
export default function ModernHistograms({
  rawRows = [],
  monthlyComparative = [],
  years = [],
  title = 'Comparativa anual',
  initialMonth,
  dailyValueKey = 'range',
  stat: statProp,
  onStatChange,
  onDailyBarClick,
}) {
  // ======= Estado UI =======
  const initialYears = useMemo(() => years.map(String), [years]);
  const [visible, setVisible] = useState(() => new Set(initialYears));
  const [statLocal, setStatLocal] = useState(statProp || 'avg'); // 'avg' | 'median'
  const stat = statProp || statLocal;

  useEffect(() => { setVisible(new Set(years.map(String))); }, [years]);
  useEffect(() => { if (statProp) setStatLocal(statProp); }, [statProp]);

  // Último mes por defecto si no llega initialMonth
  const lastDate = useMemo(() => (rawRows?.length ? rawRows[rawRows.length-1].date : undefined), [rawRows]);
  const [monthSel, setMonthSel] = useState(() => initialMonth || (lastDate ? (new Date(lastDate).getUTCMonth()+1) : 1));

  // Paleta cohesionada (sin degradados SVG)
  const palette = useMemo(() => buildPaletteSolid(years.map(String)), [years]);

  // ======= Datos para comparativa (superior) =======
  const compData = useMemo(() => {
    if (rawRows?.length) return buildMonthlyComparative(rawRows, years, stat);
    // fallback (usa el que viene del padre):
    return monthlyComparative;
  }, [rawRows, years, stat, monthlyComparative]);

  const maxMonthly = useMemo(() => getMax(compData, years.map(String)), [compData, years]);

  // ======= Datos para detalle diario (inferior) =======
  const dailyData = useMemo(() => buildDailyDistribution(rawRows, years, monthSel, dailyValueKey), [rawRows, years, monthSel, dailyValueKey]);
  const maxDaily = useMemo(() => getMax(dailyData, years.map(String)), [dailyData, years]);

  function toggleYear(k) { setVisible((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); }
  function handleStatChange(v){ setStatLocal(v); onStatChange?.(v); }

  return (
    <div className="space-y-8">
      {/* ====== Comparativa anual ====== */}
      <CardWhite>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-black/5"><Sparkles className="w-4 h-4"/></div>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          </div>
          {/* Toggle Estadístico que SÍ cambia el cálculo */}
          <StatToggle value={stat} onChange={handleStatChange} />
        </div>

        <div className="h-[360px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compData} margin={{ top: 18, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, Math.ceil(maxMonthly*1.15) || 'auto']} tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={0} stroke="#111" opacity={0.12} />
              <Tooltip cursor={false} content={<CustomTooltip formatterLabel={(l)=>`Mes ${l}`} />} />
              <Legend content={<LegendPills years={years.map(String)} visible={visible} palette={palette} onToggle={toggleYear} />} />

              {years.map((yr, idx) => (
                <Bar
                  key={yr}
                  dataKey={String(yr)}
                  name={String(yr)}
                  radius={[8, 8, 4, 4]}
                  maxBarSize={28}
                  isAnimationActive
                  animationDuration={600 + idx*120}
                  animationEasing="ease-out"
                  fill={palette?.[yr]?.fill || '#CBD5E1'}
                  stroke={palette?.[yr]?.stroke || '#94A3B8'}
                  strokeWidth={1}
                  opacity={0.95}
                  hide={!visible.has(String(yr))}
                >
                  {compData.map((_, i) => (<Cell key={`c-${yr}-${i}`} filter="url(#dropSoft)" />))}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardWhite>

      {/* ====== Detalle del mes (distribución diaria) ====== */}
      <CardWhite>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-black/5"><Sparkles className="w-4 h-4"/></div>
            <h3 className="text-lg font-semibold tracking-tight">Detalle del mes (distribución diaria)</h3>
          </div>
          <MonthPills value={monthSel} onChange={setMonthSel} />
        </div>

        {/* Leyenda de años activables (igual que arriba) */}
        <div className="mb-2"><LegendPills years={years.map(String)} visible={visible} palette={palette} onToggle={toggleYear} /></div>

        <div className="h-[320px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyData}
              margin={{ top: 18, right: 24, left: 8, bottom: 8 }}
              onClick={(st) => {
                const p = st?.activePayload?.[0]?.payload;
                if (p && onDailyBarClick) onDailyBarClick(p);
              }}
            >
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="day" tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, Math.ceil(maxDaily*1.15) || 'auto']} tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} />
              <ReferenceLine y={0} stroke="#111" opacity={0.12} />
              <Tooltip cursor={false} content={<CustomTooltip formatterLabel={(l)=>`Día ${l}`} />} />
              {years.map((yr, idx) => (
                <Bar
                  key={yr}
                  dataKey={String(yr)}
                  name={String(yr)}
                  radius={[8, 8, 4, 4]}
                  maxBarSize={28}
                  isAnimationActive
                  animationDuration={600 + idx*120}
                  animationEasing="ease-out"
                  fill={palette?.[yr]?.fill || '#CBD5E1'}
                  stroke={palette?.[yr]?.stroke || '#94A3B8'}
                  strokeWidth={1}
                  opacity={0.95}
                  hide={!visible.has(String(yr))}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardWhite>
    </div>
  );
}

// =================== UI: Cards & Controls ===================
function CardWhite({ children }) {
  return (
    <div className="relative rounded-3xl p-4 sm:p-6 bg-white border border-black/5 shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
      <defs>
        <filter id="dropSoft">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.10)"/>
        </filter>
      </defs>
      {children}
    </div>
  );
}

function StatToggle({ value, onChange }){
  return (
    <div className="inline-flex rounded-full border bg-white overflow-hidden text-xs">
      <button onClick={()=>onChange('avg')} className={`px-2.5 py-1 ${value==='avg'?'bg-indigo-600 text-white':'text-gray-700'}`}>Media</button>
      <button onClick={()=>onChange('median')} className={`px-2.5 py-1 ${value==='median'?'bg-indigo-600 text-white':'text-gray-700'}`}>Mediana</button>
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

function MonthPills({ value, onChange }){
  const months = Array.from({length:12}, (_,i)=> i+1);
  return (
    <div className="flex flex-wrap gap-1.5">
      {months.map(m => (
        <button
          key={m}
          onClick={()=>onChange(m)}
          className={`px-2 py-1 rounded-full border text-xs ${value===m?'bg-indigo-50 border-indigo-300 text-indigo-700':'bg-white hover:bg-gray-50'}`}
        >
          {String(m).padStart(2,'0')}
        </button>
      ))}
    </div>
  );
}

// =================== Tooltip liquid-glass ===================
function CustomTooltip({ active, payload, label, formatterLabel }) {
  if (!active || !payload?.length) return null;
  const heading = formatterLabel ? formatterLabel(label) : label;
  return (
    <div
      className="relative min-w-[200px] rounded-2xl border border-white/30 bg-white/10 text-xs overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.6)]"
      style={{ backdropFilter: 'blur(14px) saturate(170%)', WebkitBackdropFilter: 'blur(14px) saturate(170%)' }}
    >
      <div className="relative p-3">
        <div className="font-medium mb-1 text-gray-900/90">{heading}</div>
        <div className="grid grid-cols-1 gap-1">
          {payload.map((entry,i)=>(
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
              <span className="text-gray-700">{entry.name || entry.dataKey}</span>
              <span className="ml-auto font-semibold text-gray-900/90">{formatNumber(entry.value)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/30 rounded-2xl" />
    </div>
  );
}

// =================== Helpers ===================
function buildMonthlyComparative(rows, years, stat){
  // rows: crudos, ya filtrados por años desde el padre (analysisPool)
  const months = Array.from({ length: 12 }, (_, i) => ({ month: String(i + 1).padStart(2, '0') }));
  const byYM = new Map(); // key: `${y}-${m}` -> number[]
  for (const r of rows) {
    if (!years.includes(r.year)) continue;
    const key = `${r.year}-${r.month}`;
    if (!byYM.has(key)) byYM.set(key, []);
    byYM.get(key).push(Number(r.range));
  }
  for (const y of years) {
    for (let m=1;m<=12;m++){
      const key = `${y}-${m}`;
      const arr = byYM.get(key) || [];
      const v = arr.length ? (stat==='median' ? median(arr) : mean(arr)) : 0;
      months[m-1][String(y)] = v;
    }
  }
  return months;
}

function buildDailyDistribution(rows, years, monthSel, valueKey='range'){
  // day axis, series per year -> { day: 1..31, '2023': val, '2024': val, ... }
  const days = Array.from({length:31}, (_,i)=> ({ day: i+1 }));
  const byYMD = new Map(); // `${y}-${m}-${d}` -> value
  for (const r of rows) {
    if (!years.includes(r.year)) continue;
    if (Number(r.month) !== Number(monthSel)) continue;
    const d = new Date(r.date);
    const day = d.getUTCDate();
    const val = Number(r[valueKey]);
    if (Number.isFinite(val)) byYMD.set(`${r.year}-${r.month}-${day}`, val);
  }
  for (const y of years) {
    for (let d=1; d<=31; d++){
      const k = `${y}-${monthSel}-${d}`;
      const v = byYMD.get(k);
      days[d-1][String(y)] = Number.isFinite(v)? v : 0;
    }
  }
  // elimina días finales vacíos (por ejemplo 30/31 en Feb)
  while (days.length && years.every(y => !days[days.length-1][String(y)])) days.pop();
  return days;
}

function mean(a){ return a.reduce((s,x)=>s+x,0)/a.length; }
function median(a){ const b=[...a].sort((x,y)=>x-y); const n=b.length; const mid=(n-1)/2; const lo=Math.floor(mid), hi=Math.ceil(mid); return (b[lo]+b[hi])/2; }

function buildPaletteSolid(years){
  const base = [
    { fill: '#C7D2FE', stroke: '#818CF8' }, // indigo
    { fill: '#BAE6FD', stroke: '#7DD3FC' }, // sky
    { fill: '#BBF7D0', stroke: '#34D399' }, // green
    { fill: '#FDE68A', stroke: '#F59E0B' }, // amber
    { fill: '#FBCFE8', stroke: '#EC4899' }, // pink
    { fill: '#E9D5FF', stroke: '#A78BFA' }, // violet
  ];
  const out = {};
  years.forEach((yr, i) => { out[yr] = base[i % base.length]; });
  return out;
}

function getMax(rows, yearsStr){ let m=0; for(const r of rows){ for(const y of yearsStr){ const v=Number(r[y]); if(Number.isFinite(v)&&v>m)m=v; } } return m; }
function formatNumber(x){ const n=Number(x); if(!Number.isFinite(n)) return '—'; if(Math.abs(n)>=1000) return n.toLocaleString('es-ES'); return n.toFixed(0); }
