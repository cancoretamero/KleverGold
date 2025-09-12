// src/components/EpitomeSignalsPanel.jsx
// Señales EPITOME (risk-aware): consume /signals (acción, SL/TP, confianza).

import React, { useEffect, useState } from "react";
import { CONFIG } from "../config.js";
import { signalsFromCsv } from "../services/epitomeApi.js";

export default function EpitomeSignalsPanel() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [sig, setSig] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!CONFIG.EPITOME_ON) throw new Error("EPITOME_ON está desactivado.");
        const s = await signalsFromCsv({ csvUrl: CONFIG.CSV_URL, horizon: 24, alpha: 0.05 });
        if (!alive) return;
        setSig(s); setLoading(false);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || String(e)); setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <CardSkeleton />;
  if (err) return <CardError err={err} />;

  const actionLabel = sig.action === "long" ? "LARGO" : sig.action === "short" ? "CORTO" : "SIN POSICIÓN";
  const color = sig.action === "long" ? "#16a34a" : sig.action === "short" ? "#dc2626" : "#374151";
  const bg = sig.action === "long" ? "#dcfce7" : sig.action === "short" ? "#fee2e2" : "#e5e7eb";

  return (
    <section style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <h3 style={styles.title}>EPITOME • Señal (h={sig.horizon})</h3>
          <span style={{...styles.badge, background: bg, color }}>{actionLabel}</span>
        </div>
        <div style={{ fontSize: 12, color: "#374151" }}>
          Confianza <strong>{Math.round(sig.confidence * 100)}%</strong> · Tamaño <strong>{Math.round(sig.position_size * 100)}%</strong>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 mt-3">
        <Box k="Precio" v={fmt(sig.price0)} />
        <Box k="Objetivo" v={fmt(sig.target)} />
        <Box k="Stop" v={fmt(sig.stop)} />
        <Box k="Take Profit" v={fmt(sig.takeprofit)} />
        <Box k="Régimen" v={pickRegLabel(sig.regime)} />
        <Box k="Prob. mayor" v={`${Math.max(sig.p_bull, sig.p_bear, sig.p_chop) * 100 | 0}%`} />
      </div>

      <div style={styles.sep} />

      <div className="grid gap-3 md:grid-cols-4">
        <Small k="r̂ (log)" v={sig.metrics?.r_hat?.toFixed?.(4)} />
        <Small k="SNR" v={sig.metrics?.snr?.toFixed?.(3)} />
        <Small k="ancho log (q90/q10)" v={sig.metrics?.width_r?.toFixed?.(4)} />
        <Small k={`ES √h (α=${(sig.metrics?.alpha*100||5).toFixed(0)}%)`} v={toPct(sig.metrics?.es_h)} />
      </div>

      <div style={styles.footer}>
        <small style={{ opacity: 0.7 }}>Backend: {CONFIG.EPITOME_API}</small>
      </div>
    </section>
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
        <div style={styles.titleWrap}>
          <h3 style={styles.title}>EPITOME • Señal</h3>
          <span style={styles.badge}>cargando…</span>
        </div>
      </div>
      <div className="h-24 bg-gray-100 rounded-xl mt-3" />
    </section>
  );
}
function CardError({ err }) {
  return (
    <section style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <h3 style={styles.title}>EPITOME • Señal</h3>
          <span style={{...styles.badge, background:"#fee2e2", color:"#991b1b"}}>Error</span>
        </div>
      </div>
      <pre className="mt-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 whitespace-pre-wrap">{String(err)}</pre>
      <div className="text-[12px] text-gray-600 mt-2">
        Verifica <code>public/config.js</code> (EPITOME_API) y que el backend esté desplegado.
      </div>
    </section>
  );
}

const styles = {
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 },
  header: { display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" },
  titleWrap: { display: "flex", alignItems: "center", gap: 12 },
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" },
  badge: { fontSize: 12, padding: "4px 8px", borderRadius: 999, background: "#eef2ff", color: "#3730a3", fontWeight: 600 },
  sep: { height: 1, background: "#e5e7eb", margin: "10px 0" },
  footer: { marginTop: 8, display: "flex", justifyContent: "space-between" },
};

function fmt(v) {
  if (!Number.isFinite(v)) return "—";
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v);
}
function toPct(x) {
  if (!Number.isFinite(x)) return "—";
  const val = x * 100;
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}
function pickRegLabel(r) {
  return r === "bull" ? "Alcista" : r === "bear" ? "Bajista" : r === "chop" ? "Lateral" : "Desconocido";
}
