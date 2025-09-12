// src/components/EpitomeRiskAndRegime.jsx
// Consulta EPITOME (/risk y /regime) y muestra VaR/ES/σ/μ y probabilidades de régimen (HMM).

import React, { useEffect, useState } from "react";
import { CONFIG } from "../config.js";
import { riskFromCsv, regimeFromCsv, getHistoryFromCsv } from "../services/epitomeApi.js";

export default function EpitomeRiskAndRegime() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [risk, setRisk] = useState(null);     // { sigma, mu, var, es, alpha }
  const [reg, setReg] = useState(null);       // { regime, p_bull, p_bear, p_chop }
  const [meta, setMeta] = useState(null);     // { n, lastPrice }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!CONFIG.EPITOME_ON) throw new Error("EPITOME_ON está desactivado.");
        const hist = await getHistoryFromCsv(CONFIG.CSV_URL);
        const [r1, r2] = await Promise.all([
          riskFromCsv({ csvUrl: CONFIG.CSV_URL, alpha: 0.05 }),
          regimeFromCsv({ csvUrl: CONFIG.CSV_URL }),
        ]);
        if (!alive) return;
        setRisk(r1);
        setReg(r2);
        setMeta({ n: hist.price.length, lastPrice: hist.price[hist.price.length - 1] });
        setLoading(false);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || String(e));
        setLoading(false);
      }
    })();
    return () => { alive = false };
  }, []);

  if (loading) return <CardSkeleton />;
  if (err) return <CardError err={err} />;

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <RiskCard risk={risk} meta={meta} />
      <RegimeCard reg={reg} />
    </section>
  );
}

/* ===== Risk Card ===== */
function RiskCard({ risk, meta }) {
  const { sigma, mu, var: var1, es, alpha } = risk || {};
  const items = [
    { k: "σ (vol 1-step)", v: toPct(sigma), hint: "Desviación condicional (diaria)" },
    { k: "μ (ret 1-step)", v: toPct(mu),    hint: "Media condicional (diaria)" },
    { k: `VaR (α=${(alpha*100).toFixed(0)}%)`, v: toPct(var1), hint: "Límite de pérdida 1-step" },
    { k: `ES (α=${(alpha*100).toFixed(0)}%)`,  v: toPct(es),   hint: "Pérdida esperada en cola" },
  ];

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <h3 style={styles.title}>EPITOME • Riesgo (GARCH)</h3>
          <span style={styles.badge}>h=1 paso</span>
        </div>
        <small style={{opacity:.7}}>obs: {meta?.n?.toLocaleString?.("es-ES") ?? "—"}</small>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-2">
        {items.map((it) => (
          <div key={it.k} className="rounded-xl border p-3 bg-white">
            <div className="text-xs text-gray-500">{it.k}</div>
            <div className="text-lg font-semibold">{it.v}</div>
            <div className="text-[11px] text-gray-500">{it.hint}</div>
          </div>
        ))}
      </div>

      <div style={styles.footer}>
        <small style={{opacity:.7}}>Backend: {CONFIG.EPITOME_API}</small>
      </div>
    </div>
  );
}

/* ===== Regime Card ===== */
function RegimeCard({ reg }) {
  const p = {
    bull: clamp01(reg?.p_bull ?? 0),
    bear: clamp01(reg?.p_bear ?? 0),
    chop: clamp01(reg?.p_chop ?? 0),
  };
  const total = p.bull + p.bear + p.chop || 1;
  const w = {
    bull: (p.bull / total) * 100,
    chop: (p.chop / total) * 100,
    bear: (p.bear / total) * 100,
  };
  const label =
    reg?.regime === "bull" ? "Alcista" :
    reg?.regime === "bear" ? "Bajista" :
    reg?.regime === "chop" ? "Lateral" : "Desconocido";

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.titleWrap}>
          <h3 style={styles.title}>EPITOME • Régimen (HMM)</h3>
          <span style={{...styles.regimeTag, background: pickBg(reg?.regime), color: pickFg(reg?.regime)}}>
            {label}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <div className="w-full h-8 rounded-full overflow-hidden border" title="Probabilidades de régimen">
          <div style={{ width: `${w.bull}%`, height: "100%", background: "#22c55e", display: "inline-block" }} />
          <div style={{ width: `${w.chop}%`, height: "100%", background: "#9ca3af", display: "inline-block" }} />
          <div style={{ width: `${w.bear}%`, height: "100%", background: "#ef4444", display: "inline-block" }} />
        </div>
        <div className="flex justify-between text-[12px] mt-2 text-gray-700">
          <span>Bull: {(p.bull*100).toFixed(1)}%</span>
          <span>Chop: {(p.chop*100).toFixed(1)}%</span>
          <span>Bear: {(p.bear*100).toFixed(1)}%</span>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-gray-500">
        Las probabilidades se estiman con HMM sobre retornos log; se actualizan cada vez que cargas la página.
      </div>
    </div>
  );
}

/* ===== Helpers & estilos ===== */
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
  titleWrap: { display:
