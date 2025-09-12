from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from typing import Dict, Any

from .statsforecast_model import train_and_forecast_stats
from .conformal import ConformalCalibrator
from .regime import hmm_regime
from .risk import risk_garch_var_es


@dataclass
class SignalConfig:
    alpha: float = 0.05        # cola para VaR/ES
    horizon: int = 24          # pasos de predicción
    gate_frac: float = 0.15    # umbral como fracción del ancho q10-q90 en retornos


def _safe_log(x: float) -> float:
    return float(np.log(max(1e-12, x)))


def compute_signal(prices: np.ndarray, timestamps: list[str] | None, cfg: SignalConfig | None = None) -> Dict[str, Any]:
    """
    Política de trading *risk-aware*:
      - Predicción (q05..q95) con StatsForecast + conformal (aprox multi-h).
      - Régimen HMM (bull/bear/chop).
      - Riesgo 1-step con GARCH (VaR/ES) y proyección sqrt(h) para horizonte.
      - Decisión LONG/SHORT/FLAT con:
          * dirección = sign(log(q50_h / P0))
          * umbral = gate_frac * log(q90_h / q10_h)
          * requiere consistencia con probas de régimen
      - Stop/TP desde cuantiles y budget por ES.
    """
    if cfg is None:
        cfg = SignalConfig()

    prices = np.asarray(prices, dtype=float)
    if prices.size < 120:
        raise ValueError("Se requieren >=120 precios para señales (Stats + HMM + GARCH).")

    # 1) Predicción base + residuales de calibración
    base = train_and_forecast_stats(prices, timestamps or [], horizon=cfg.horizon, calib_len=None)
    calibr = ConformalCalibrator(alpha_low=0.05, alpha_high=0.95)
    q05, q10, q50, q90, q95 = calibr.apply(
        q50=base["q50_base"],
        q10=base["q10_base"],
        q90=base["q90_base"],
        q05=base["q05_base"],
        q95=base["q95_base"],
        residuals=base["residuals"],
    )

    # 2) Régimen y riesgo (VaR/ES 1-step)
    rets = np.diff(np.log(prices))
    regime, p_bull, p_bear, p_chop = hmm_regime(rets)
    risk = risk_garch_var_es(rets, alpha=cfg.alpha)
    # proyectamos riesgo a horizonte ~ sqrt(h)
    h = int(cfg.horizon)
    es_h = abs(risk["es"]) * np.sqrt(max(1, h))

    # 3) Señal por horizonte final (índice h-1)
    h_idx = max(0, min(h - 1, len(q50) - 1))
    p0 = float(prices[-1])
    q05h, q10h, q50h, q90h, q95h = map(lambda a: float(a[h_idx]), (q05, q10, q50, q90, q95))

    r_hat = _safe_log(q50h / p0)               # retorno esperado (log) a h
    width_r = max(1e-8, _safe_log(q90h / q10h))  # “ancho” de la distribución en log
    thr = cfg.gate_frac * width_r               # umbral direccional
    snr = r_hat / width_r                       # señal/ruido (adimensional)

    # 4) Decisión dirección con consistencia de régimen
    action = "flat"
    if (r_hat > thr) and (p_bull >= max(p_bear, p_chop)):   # consenso alcista
        action = "long"
    elif (r_hat < -thr) and (p_bear >= max(p_bull, p_chop)):  # consenso bajista
        action = "short"

    # 5) Stops/TP/target y confianza
    if action == "long":
        stop = min(q10h, q05h)
        take = max(q90h, q95h)
        reg_prob = float(p_bull)
    elif action == "short":
        stop = max(q90h, q95h)
        take = min(q10h, q05h)
        reg_prob = float(p_bear)
    else:
        stop = p0
        take = p0
        reg_prob = float(p_chop)

    target = q50h
    snr_norm = float(min(1.0, abs(snr)))                 # 0..1
    confidence = float(np.clip(0.6 * reg_prob + 0.4 * snr_norm, 0.0, 1.0))

    # tamaño sugerido (0..1) relativo a budget por ES del horizonte
    pos_size = float(np.clip(abs(r_hat) / max(1e-8, es_h), 0.0, 1.0))

    return {
        "action": action,
        "horizon": h,
        "price0": p0,
        "target": target,
        "stop": stop,
        "takeprofit": take,
        "confidence": confidence,
        "regime": regime,
        "p_bull": float(p_bull),
        "p_bear": float(p_bear),
        "p_chop": float(p_chop),
        "position_size": pos_size,
        "metrics": {
            "r_hat": r_hat,
            "snr": snr,
            "width_r": width_r,
            "es_h": es_h,
            "alpha": cfg.alpha,
        },
        "quantiles": {
            "q05": q05.tolist(),
            "q10": q10.tolist(),
            "q50": q50.tolist(),
            "q90": q90.tolist(),
            "q95": q95.tolist(),
        },
    }
