// src/components/EpitomeForecastPanel.jsx
// Panel autónomo: lee tu CSV, llama al backend EPITOME y dibuja bandas de cuantiles.
// Sin dependencias externas; usa SVG responsivo.

import React, { useEffect, useMemo, useState } from "react";
import { CONFIG } from "../config.js";
import { forecastFromCsv, getHistoryFromCsv } from "../services/epitomeApi.js";

const HORIZON_DEFAULT = 48; // horas (puedes cambiarlo)

export default function EpitomeForecastPanel() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [history, setHistory] = useState(null); // {timestamps, price}
  const [fc, setFc] = useState(null); // {quantiles:{}, regime, coverage_target}

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!CONFIG.EPITOME_ON) {
          throw new Error("EPITOME_ON está desactivado en config.");
        }
        const hist = await getHistoryFromCsv(CONFIG.CSV_URL);
        const res = await forecastFromCsv({
          csvUrl: CONFIG.CSV_URL,
          horizon: HORIZON_DEFAULT,
        });
        if (!alive) return;
        setHistory(hist);
        setFc(res);
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || String(e));
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <PanelSkeleton />;
  if (err) return <PanelError err={err} />;

  return (
    <div className="epitome-card" style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <h2 style={styles.title}>EPITOME • Pronóstico probabilístico</h2>
          <span style={styles.badge}>
            Cobertura objetivo: {Math.round((fc.coverage_target || 0) * 100)}%
          </span>
        </div>
        <RegimeTag regime={fc.regime} />
      </div>

      <div style={{ marginTop: 8 }}>
        <QuantileChart
          history={history}
          forecast={fc}
          tail={120}
          height={320}
        />
      </div>

      <div style={styles.legend}>
        <span style={styles.dot("#000")}>●</span> Mediana (q50)
        <span style={styles.dot("rgba(0,0,0,0.15)")}>●</span> Banda q05–q95
      </div>

      <div style={styles.footer}>
        <small style={{ opacity: 0.7 }}>
          Fuente: CSV {CONFIG.CSV_URL} · Backend: {CONFIG.EPITOME_API}
        </small>
      </div>
    </div>
  );
}

/* ========== Subcomponentes ========== */

function PanelSkeleton() {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <h2 style={styles.title}>EPITOME • Pronóstico probabilístico</h2>
          <span style={styles.badge}>Cargando…</span>
        </div>
      </div>
      <div style={{ height: 320, background: "#f3f4f6", borderRadius: 16 }} />
    </div>
  );
}

function PanelError({ err }) {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <h2 style={styles.title}>EPITOME • Pronóstico probabilístico</h2>
          <span style={{ ...styles.badge, background: "#fee2e2", color: "#991b1b" }}>
            Error
          </span>
        </div>
      </div>
      <pre style={styles.errorBox}>{String(err)}</pre>
      <ul style={styles.hintList}>
        <li>¿Está levantado el backend en {CONFIG.EPITOME_API}?</li>
        <li>¿Hay al menos 60 filas en el CSV {CONFIG.CSV_URL}?</li>
        <li>Revisa <code>public/config.js</code> y <code>src/config.js</code>.</li>
      </ul>
    </div>
  );
}

function RegimeTag({ regime }) {
  const color =
    regime === "bull" ? "#14532d" : regime === "bear" ? "#7f1d1d" : "#1f2937";
  const bg =
    regime === "bull" ? "#dcfce7" : regime === "bear" ? "#fee2e2" : "#e5e7eb";
  const label =
    regime === "bull" ? "Régimen: Alcista" : regime === "bear" ? "Régimen: Bajista" : "Régimen: Lateral/Desconocido";
  return (
    <span style={{ ...styles.regime, color, background: bg }}>{label}</span>
  );
}

/** Dibuja histórico + bandas de cuantiles (q05–q95) + mediana q50 */
function QuantileChart({ history, forecast, tail = 120, height = 320 }) {
  const data = useMemo(() => {
    const { timestamps, price } = history;
    const q = forecast?.quantiles || {};
    const q05 = q.q05 || [];
    const q10 = q.q10 || [];
    const q50 = q.q50 || [];
    const q90 = q.q90 || [];
    const q95 = q.q95 || [];

    const tailIdx = Math.max(0, price.length - tail);
    const histX = [...Array(price.length - tailIdx)].map((_, i) => i);
    const futX = [...Array(q50.length)].map((_, i) => histX.length + i);

    // Rango Y basado en histórico reciente + banda de forecast
    const allY = [
      ...price.slice(tailIdx),
      ...q05,
      ...q95,
      ...q50,
    ].filter((v) => Number.isFinite(v));
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const pad = (maxY - minY) * 0.1 || 1;
    const yMin = minY - pad;
    const yMax = maxY + pad;

    return {
      histX, futX,
      histY: price.slice(tailIdx),
      q05, q10, q50, q90, q95,
      yMin, yMax,
    };
  }, [history, forecast, tail]);

  const width = 960; // tamaño virtual; el SVG es responsive con viewBox
  const margin = { l: 48, r: 16, t: 16, b: 28 };
  const innerW = width - margin.l - margin.r;
  const innerH = height - margin.t - margin.b;

  // Escalas
  const xMax = data.histX.length + data.futX.length - 1;
  const sx = (x) => margin.l + (innerW * x) / Math.max(1, xMax);
  const sy = (y) => margin.t + innerH * (1 - (y - data.yMin) / (data.yMax - data.yMin));

  // Paths
  const pathLine = (xs, ys) =>
    xs
      .map((x, i) => `${i === 0 ? "M" : "L"} ${sx(x).toFixed(2)} ${sy(ys[i]).toFixed(2)}`)
      .join(" ");

  const pathArea = (xs, yTop, yBot) => {
    const up = xs
      .map((x, i) => `${i === 0 ? "M" : "L"} ${sx(x).toFixed(2)} ${sy(yTop[i]).toFixed(2)}`)
      .join(" ");
    const down = [...xs]
      .reverse()
      .map((x, i) => {
        const idx = yBot.length - 1 - i;
        return `L ${sx(x).toFixed(2)} ${sy(yBot[idx]).toFixed(2)}`;
      })
      .join(" ");
    return `${up} ${down} Z`;
  };

  const histPath = pathLine(
    data.histX,
    data.histY.map((v) => v)
  );
  const xsForecast = [...data.futX];
  const areaQ0595 = pathArea(xsForecast, data.q95, data.q05);
  const lineQ50 = pathLine(xsForecast, data.q50);

  // Eje Y (ticks 4)
  const ticks = 4;
  const yTicks = [...Array(ticks + 1)].map((_, i) => data.yMin + (i * (data.yMax - data.yMin)) / ticks);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }}>
      {/* Fondo */}
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" rx="16" />

      {/* Ejes Y */}
      {yTicks.map((v, i) => {
        const y = sy(v);
        return (
          <g key={i}>
            <line
              x1={margin.l}
              x2={width - margin.r}
              y1={y}
              y2={y}
              stroke="#e5e7eb"
              strokeDasharray="4 4"
            />
            <text x={8} y={y + 4} fontSize="11" fill="#6b7280">
              {formatPrice(v)}
            </text>
          </g>
        );
      })}

      {/* Histórico */}
      <path d={histPath} fill="none" stroke="#9ca3af" strokeWidth="1.2" />

      {/* Banda q05–q95 */}
      <path d={areaQ0595} fill="rgba(0,0,0,0.08)" stroke="none" />

      {/* Mediana */}
      <path d={lineQ50} fill="none" stroke="#111827" strokeWidth="1.6" />

      {/* Separador entre histórico y futuro */}
      <line
        x1={sx(data.histX.length - 1)}
        y1={margin.t}
        x2={sx(data.histX.length - 1)}
        y2={height - margin.b}
        stroke="#d1d5db"
        strokeDasharray="2 4"
      />
    </svg>
  );
}

/* ========== estilos inline mínimos ========== */
const styles = {
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 16,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
  },
  titleWrap: { display: "flex", alignItems: "center", gap: 12 },
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" },
  badge: {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#3730a3",
    fontWeight: 600,
  },
  regime: {
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    fontWeight: 700,
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginTop: 10,
    color: "#374151",
    fontSize: 12,
  },
  dot: (color) => ({ display: "inline-block", color, marginLeft: 8, marginRight: 4 }),
  footer: { marginTop: 8, display: "flex", justifyContent: "space-between" },
  errorBox: {
    whiteSpace: "pre-wrap",
    background: "#fff7ed",
    color: "#7c2d12",
    border: "1px solid #fed7aa",
    padding: 12,
    borderRadius: 12,
    fontSize: 12,
  },
  hintList: { marginTop: 8, color: "#374151", fontSize: 13, lineHeight: 1.5 },
};

/* ========== utilidades ========== */
function formatPrice(v) {
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  const d = abs >= 1000 ? 2 : 3;
  return Intl.NumberFormat("en-US", {
    style: "decimal",
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  }).format(v);
}
