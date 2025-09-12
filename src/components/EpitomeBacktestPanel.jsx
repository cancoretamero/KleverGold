// src/components/EpitomeBacktestPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import { CONFIG } from "../config.js";
import { backtestFromCsv } from "../services/epitomeApi.js";

export default function EpitomeBacktestPanel() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [data, setData] = useState(null); // { metrics, counts, equity_curve }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!CONFIG.EPITOME_ON) throw new Error("EPITOME_ON está desactivado.");
        const res = await backtestFromCsv({});
        if (!alive) return;
        setData(res); setLoading(false);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || String(e)); setLoading(false);
      }
    })();
    return () => { alive = false };
  }, []);

  if (loading) return <CardSkeleton />;
  if (err) return <CardError err={err} />;

  const m = data.metrics || {};
  const counts = data.counts || {};
  const curve = data.equity_curve || { equity: [], timestamps: [] };

  return (
    <section style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <h3 style={styles.title}>EPITOME • Backtest (señal)</h3>
          <span style={styles.badge}>stride {m.stride} · h={m.horizon}</span>
        </div>
        <div style={{ fontSize: 12, color: "#374151" }}>
          α={Math.round((m.alpha||0)*100)}% · fees {toPct(m.fees)} · slip {toPct(m.slippage)}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4 mt-3">
        <Box k="CAGR" v={toPct(m.cagr)} />
        <Box k="Sharpe" v={fmtNum(m.sharpe, 2)} />
        <Box k="Max Drawdown" v={toPct(m.max_drawdown)} />
        <Box k="Hit-rate" v={toPct(m.hit_rate)} />
      </div>

      <div className="grid gap-3 md:grid-cols-3 mt-3">
        <Small k="Pasos" v={m.n_steps} />
        <Small k="Long" v={counts.long || 0} />
        <Small k="Short" v={counts.short || 0} />
      </div>

      <div style={{ marginTop: 10 }}>
        <EquitySparkline equity={curve.equity || []} height={140} />
      </div>

      <div style={styles.footer}>
        <small style={{ opacity: .7 }}>Backend: {CONFIG.EPITOME_API}</small>
      </div>
    </section>
  );
}

function EquitySparkline({ equity = [], height = 140 }) {
  const width = 960;
  const margin = { l: 40, r: 16, t: 8, b: 20 };
  const innerW = width - margin.l - margin.r;
  const innerH = height - margin.t - margin.b;

  const yMin = equity.length ? Math.min(...equity) : 1;
  const yMax = equity.length ? Math.max(...equity) : 1;
  const sx = (i) => margin.l + (innerW * i) / Math.max(1, equity.length - 1);
  const sy = (v) => margin.t + innerH * (1 - (v - yMin) / Math.max(1e-9, yMax - yMin));

  const path = equity.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i).toFixed(2)} ${sy(v).toFixed(2)}`).join(" ");

  // ticks Y
  const ticks = 4;
  const yTicks = [...Array(ticks + 1)].map((_, i) => yMin + (i * (yMax - yMin)) / ticks);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }}>
      <rect x="0" y="0" width={width} height={height} fill="#fff" rx="16" />
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={margin.l} x2={width - margin.r} y1={sy(v)} y2={sy(v)} stroke="#e5e7eb" strokeDasharray="3 5" />
          <text x={6} y={sy(v) + 4} fontSize="11" fill="#6b7280">{fmtNum(v, 2)}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#111827" strokeWidth="1.6" />
    </svg>
  );
}

function Box({ k, v }) {
  return (
    <div className="rounded-xl border p-3 bg-white">
      <div className="text-xs text-gray-500">{k}</div>
      <div className="text-lg font-semibold">{v ?? "—"}</div>
    </div>
  );
}
function Small({ k, v }) {
  return (
    <div className="rounded-lg border p-2 bg-white">
      <div className="text-[11px] text-gray-500">{k}</div>
      <div className="text-sm font-semibold">{String(v ?? "—")}</div>
    </div>
  );
}
function CardSkeleton() {
  return (
    <section style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}><h3 style={styles.title}>EPITOME • Backtest</h3><span style={styles.badge}>cargando…</span></div>
      </div>
      <div className="h-24 bg-gray-100 rounded-xl mt-3" />
    </section>
  );
}
function CardError({ err }) {
  return (
    <section style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}><h3 style={styles.title}>EPITOME • Backtest</h3><span style={{...styles.badge, background:"#fee2e2", color:"#991b1b"}}>Error</span></div>
      </div>
      <pre className="mt-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 whitespace-pre-wrap">{String(err)}</pre>
      <div className="text-[12px] text-gray-600 mt-2">Revisa <code>public/config.js</code> y que el backend tenga el endpoint <code>/backtest</code>.</div>
    </section>
  );
}

const styles = {
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 },
  header: { display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" },
  titleWrap: { display: "flex", alignItems: "center", gap: 12 },
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" },
  badge: { fontSize: 12, padding: "4px 8px", borderRadius: 999, background: "#eef2ff", color: "#3730a3", fontWeight: 600 },
};

function toPct(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(2)}%`;
}
function fmtNum(x, d = 2) {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(d);
}
