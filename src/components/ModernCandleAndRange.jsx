'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Brush,
  ReferenceLine,
} from 'recharts';

/**
 * ModernCandleAndRange.jsx
 * ------------------------------------------------------------------
 * - CandlePanelModern (Lightweight-Charts): velas con tooltip liquid-glass
 * - DailyRangePanelModern (Recharts Area): rango diario con tooltip liquid-glass
 *
 * Ambos usan fondo blanco, paleta sutil y estilo consistente con los histogramas.
 */

// ============================ Candle Panel ============================
export function CandlePanelModern({ data = [], title = 'Velas', height = 420 }) {
  const ref = useRef(null);
  const tooltipRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Normaliza datos a epoch-seconds
  const candles = useMemo(() => {
    return (data || [])
      .map((d) => {
        const t = toDate(d.date);
        return {
          time: Math.floor(t.getTime() / 1000),
          open: +d.open, high: +d.high, low: +d.low, close: +d.close,
        };
      })
      .filter((d) =>
        Number.isFinite(d.open) &&
        Number.isFinite(d.high) &&
        Number.isFinite(d.low) &&
        Number.isFinite(d.close)
      );
  }, [data]);

  // Series auxiliares para métricas
  const ranges = useMemo(() => candles.map(c => c.high - c.low), [candles]);
  const rangeMA7 = useMemo(() => movingAverage(ranges, 7), [ranges]);

  useEffect(() => {
    let chart, series, dispose;

    (async () => {
      try {
        // Requiere: npm i lightweight-charts
        const lib = await import('lightweight-charts');
        const createChart = lib.createChart ?? lib.default?.createChart;
        if (!ref.current || !createChart) return;

        chart = createChart(ref.current, {
          height,
          layout: { background: { color: '#ffffff' }, textColor: '#0f172a', fontSize: 12 },
          grid: { vertLines: { color: '#eef2f7' }, horzLines: { color: '#eef2f7' } },
          rightPriceScale: { borderVisible: false },
          timeScale: { borderVisible: false },
          crosshair: { mode: 1 },
        });

        series = chart.addCandlestickSeries({
          upColor: '#10b981', downColor: '#ef4444',
          borderUpColor: '#059669', borderDownColor: '#dc2626',
          wickUpColor: '#047857', wickDownColor: '#b91c1c',
        });
        series.setData(candles);

        // price line última close
        const lastClose = candles[candles.length-1]?.close;
        if (Number.isFinite(lastClose)) {
          series.createPriceLine({ price: lastClose, color: '#0ea5e9', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Close' });
        }

        // Tooltip overlay (liquid glass)
        const el = tooltipRef.current;
        if (el) el.style.display = 'none';
        chart.subscribeCrosshairMove((param) => {
          if (!param || !param.time || !el) { if (el) el.style.display = 'none'; return; }
          const idx = candles.findIndex(c => c.time === param.time);
          if (idx === -1) { el.style.display = 'none'; return; }
          const c = candles[idx];
          const r = ranges[idx];
          const ma7 = rangeMA7[idx] ?? null;
          const pct = ((c.close - c.open) / Math.max(1e-9, c.open)) * 100;

          el.innerHTML = glassHtml({
            heading: new Date(c.time * 1000).toISOString().slice(0,10),
            rows: [
              ['Open', fmt(c.open)],
              ['High', fmt(c.high)],
              ['Low', fmt(c.low)],
              ['Close', fmt(c.close)],
              ['Δ% (O→C)', `${pct>=0?'+':''}${pct.toFixed(2)}%`],
            ],
            metrics: [
              ['Rango (H-L)', fmt(r)],
              ['Media Rango 7', ma7!=null?fmt(ma7):'—'],
              ['Body', fmt(Math.abs(c.close - c.open))],
            ],
          });

          el.style.display = 'block';
          const p = param.point; const pad = 12;
          const host = ref.current.getBoundingClientRect();
          el.style.left = Math.min(Math.max(p.x + pad, 8), host.width - 220) + 'px';
          el.style.top  = Math.min(Math.max(p.y + pad, 8), host.height - 160) + 'px';
        });

        setReady(true);
        dispose = () => { try { chart.remove(); } catch(_){} };
      } catch (e) {
        setReady(false);
      }
    })();

    return () => { try { if (dispose) dispose(); } catch(_){} };
  }, [candles, height, ranges, rangeMA7]);

  return (
    <div className="rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
      <div className="px-4 pt-3 pb-2 text-sm font-semibold">{title}</div>
      <div ref={ref} style={{ height }} className="relative">
        <div ref={tooltipRef} className="pointer-events-none absolute z-20" style={{ minWidth: 200 }} />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-xs text-gray-500">Cargando motor de velas…</div>
        )}
      </div>
    </div>
  );
}

// ============================ Daily Range Panel (opcional) ============================
export function DailyRangePanelModern({ data = [], valueKey = 'range', title = 'Variación diaria (High−Low)', height = 320 }) {
  const rows = useMemo(() => (data || []).map(r => ({
    date: toDate(r.date),
    ts: toDate(r.date).getTime(),
    value: Number(r[valueKey]),
  })).filter(r => Number.isFinite(r.value)).sort((a,b)=>a.ts-b.ts), [data, valueKey]);

  const arr = useMemo(()=> rows.map(r=>r.value).filter(Number.isFinite).sort((a,b)=>a-b), [rows]);
  const stats = useMemo(()=> statsFromArray(arr), [arr]);

  const ma7  = useMemo(()=> movingAverage(rows.map(r=>r.value), 7),  [rows]);
  const ma30 = useMemo(()=> movingAverage(rows.map(r=>r.value), 30), [rows]);

  const chartData = useMemo(() => rows.map((r,i)=>({
    dateLabel: r.date.toISOString().slice(0,10),
    value: r.value,
    ma7: ma7[i] ?? null,
    ma30: ma30[i] ?? null,
  })), [rows, ma7, ma30]);

  return (
    <div className="rounded-3xl border border-black/5 bg-white shadow-[0_10px_24px_rgba(0,0,0,0.05)]">
      <div className="px-4 pt-3 pb-2 text-sm font-semibold">{title}</div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 6" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="dateLabel" tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={64} />
            <YAxis tick={{ fill: '#111', fontSize: 12 }} tickLine={false} axisLine={false} width={48} />
            <ReferenceLine y={0} stroke="#111" opacity={0.12} />
            <RTooltip cursor={false} content={<RangeGlassTooltip context={{ statsGlobal: stats }} />} />
            <Area type="monotone" dataKey="value" name="Rango" stroke="#3b82f6" strokeWidth={1.5} fill="#3b82f622" />
            <Area type="monotone" dataKey="ma7"   name="MA 7"   stroke="#22c55e" strokeWidth={1.2} fillOpacity={0} />
            <Area type="monotone" dataKey="ma30"  name="MA 30"  stroke="#f59e0b" strokeWidth={1.2} fillOpacity={0} />
            <Brush dataKey="dateLabel" height={20} travellerWidth={8} stroke="#94a3b8" fill="#e5e7eb" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Tooltip liquid-glass para Range ----------
function RangeGlassTooltip({ active, payload, label, context = {} }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload || {};
  const val = p.value;
  const { statsGlobal } = context;
  const perc = percentileRankFromSorted(statsGlobal.sorted || [], val);
  return (
    <div className="relative min-w-[220px] rounded-2xl border border-white/30 bg-white/10 text-xs overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.6)]" style={{ backdropFilter: 'blur(14px) saturate(170%)', WebkitBackdropFilter: 'blur(14px) saturate(170%)' }}>
      <div className="relative p-3">
        <div className="font-medium mb-1 text-gray-900/90">{label}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-700">
          <Metric label="Rango" value={fmt(val)} />
          <Metric label="Percentil" value={`${Math.round(perc*100)}%`} />
          <Metric label="Media" value={fmt(statsGlobal.mean)} />
          <Metric label="σ / CV" value={`${fmt(statsGlobal.std)} / ${(statsGlobal.cv*100).toFixed(1)}%`} />
          <Metric label="p90 / p95" value={`${fmt(statsGlobal.p90)} / ${fmt(statsGlobal.p95)}`} />
          <Metric label="Mín / Máx" value={`${fmt(statsGlobal.min)} / ${fmt(statsGlobal.max)}`} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/30 rounded-2xl" />
    </div>
  );
}

function Metric({label, value}){
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-600">{label}</span>
      <span className="ml-auto font-semibold text-gray-900/90">{value}</span>
    </div>
  );
}

// ============================ Utils ============================
function toDate(d){ if (d instanceof Date) return d; const t = new Date(d); return Number.isFinite(+t) ? t : new Date(); }
function movingAverage(arr, k){ const out = new Array(arr.length).fill(null); let sum = 0; const q = []; for(let i=0;i<arr.length;i++){ const v = Number(arr[i]); if (!Number.isFinite(v)) { q.push(0); } else { q.push(v); sum += v; } if (q.length > k) sum -= q.shift(); if (q.length === k) out[i] = sum / k; } return out; }
function fmt(x){ const n=Number(x); if(!Number.isFinite(n)) return '—'; return Math.abs(n)>=1000 ? n.toLocaleString('es-ES') : n.toFixed(2); }
function statsFromArray(sortedArr){
  const a = sortedArr.slice().sort((x,y)=>x-y);
  const n = a.length; if(!n) return { n:0, mean:0, median:0, p90:0, p95:0, min:0, max:0, std:0, cv:0, sorted:a };
  const sum = a.reduce((s,x)=>s+x,0); const mean=sum/n; const median=quantile(a,0.5); const p90=quantile(a,0.90); const p95=quantile(a,0.95); const min=a[0]; const max=a[n-1];
  const variance = a.reduce((s,x)=>s+(x-mean)*(x-mean),0)/n; const std=Math.sqrt(variance); const cv=mean!==0?std/mean:0;
  return { n, mean, median, p90, p95, min, max, std, cv, sorted:a };
}
function quantile(sortedAsc,q){ const n=sortedAsc.length; if(!n) return 0; const pos=(n-1)*q; const b=Math.floor(pos); const r=pos-b; return sortedAsc[b+1]!==undefined? sortedAsc[b]+r*(sortedAsc[b+1]-sortedAsc[b]) : sortedAsc[b]; }
function percentileRankFromSorted(sortedAsc, value){ if(!sortedAsc.length) return 0; let i=0; while(i<sortedAsc.length && sortedAsc[i]<=value) i++; if(sortedAsc.length===1) return 1; return (i-1)/(sortedAsc.length-1); }
function glassHtml({ heading, rows = [], metrics = [] }){
  return `
  <div class="relative min-w-[220px] rounded-2xl border border-white/30 bg-white/10 text-xs overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.6)]" style="backdrop-filter:blur(14px) saturate(170%);-webkit-backdrop-filter:blur(14px) saturate(170%);">
    <div class="relative p-3">
      <div class="font-medium mb-1 text-gray-900/90">${heading}</div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-700">
        ${rows.map(([k,v])=>`<div class=\"flex items-center gap-2\"><span class=\"text-gray-600\">${k}</span><span class=\"ml-auto font-semibold text-gray-900/90\">${v}</span></div>`).join('')}
      </div>
      <div class="my-2 h-px bg-white/50"></div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-700">
        ${metrics.map(([k,v])=>`<div class=\"flex items-center gap-2\"><span class=\"text-gray-600\">${k}</span><span class=\"ml-auto font-semibold text-gray-900/90\">${v}</span></div>`).join('')}
      </div>
    </div>
    <div class="pointer-events-none absolute inset-0 ring-1 ring-white/30 rounded-2xl"></div>
  </div>`;
}
