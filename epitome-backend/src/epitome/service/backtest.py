from __future__ import annotations
import numpy as np
from dataclasses import dataclass
from typing import Dict, Any, List, Tuple

from .policy import compute_signal, SignalConfig


@dataclass
class BacktestConfig:
    horizon: int = 24           # pasos de predicción usados por la política
    alpha: float = 0.05         # cola para VaR/ES en la política
    stride: int = 5             # re-evaluar la señal cada 'stride' barras
    lookback_min: int = 300     # historial mínimo para arrancar
    fees: float = 0.0002        # comisiones aprox. (20 bps)
    slippage: float = 0.0001    # slippage aprox. (10 bps)
    rebalance: str = "next"     # 'next' = aplica la señal hasta la próxima evaluación
    annualization: int = 252    # sesiones/año para métricas (dato diario)


def _logret(p1: float, p0: float) -> float:
    return float(np.log(max(1e-12, p1) / max(1e-12, p0)))


def _equity_metrics(logrets: np.ndarray, annualization: int) -> Dict[str, float]:
    """CAGR, Sharpe, Max Drawdown, hit-rate, etc."""
    lr = np.array(logrets, dtype=float)
    if lr.size == 0:
        return {"cagr": 0.0, "sharpe": 0.0, "max_drawdown": 0.0, "hit_rate": 0.0}
    # equity
    equity = np.exp(np.cumsum(lr))
    peak = np.maximum.accumulate(equity)
    dd = (equity - peak) / peak
    max_dd = float(np.min(dd)) if dd.size > 0 else 0.0
    # anualización
    mean = float(np.mean(lr))
    std = float(np.std(lr, ddof=1)) if lr.size > 1 else 0.0
    sharpe = (mean / (std + 1e-12)) * np.sqrt(annualization) if std > 0 else 0.0
    years = lr.size / max(1, annualization)
    cagr = float(equity[-1] ** (1 / max(1e-9, years)) - 1) if years > 0 else 0.0
    hit = float(np.mean(lr > 0))
    return {"cagr": cagr, "sharpe": sharpe, "max_drawdown": max_dd, "hit_rate": hit}


def backtest_signal(
    prices: np.ndarray,
    timestamps: List[str] | None,
    cfg: BacktestConfig | None = None,
) -> Dict[str, Any]:
    """Backtest ligero de la política risk-aware.

    Estrategia:
      - En t = start, calcula señal con todos los datos [0..t].
      - Mantiene la posición hasta t+stride (rebalance 'next').
      - Retorno de la cartera = size * (± logret(t→t+stride) - fees - slippage).
      - Repite hasta el final de la serie.
    """
    if cfg is None:
        cfg = BacktestConfig()

    P = np.asarray(prices, dtype=float)
    n = P.size
    if n < max(120, cfg.lookback_min):
        raise ValueError("Se requiere historial suficiente para backtest (>=120).")

    start = max(cfg.lookback_min, 120)
    equity = 1.0
    logret_series: List[float] = []
    eq_curve: List[Tuple[int, float]] = []  # (índice, equity)
    counts = {"long": 0, "short": 0, "flat": 0}

    t = start
    while t < n - 1:
        # ventana hasta t (inclusive)
        ts_win = (timestamps[: t + 1] if timestamps else None)
        sig = compute_signal(P[: t + 1], ts_win, cfg=SignalConfig(alpha=cfg.alpha, horizon=cfg.horizon))

        action = sig["action"]
        size = float(sig["position_size"])
        counts[action] = counts.get(action, 0) + 1

        step = min(cfg.stride, n - 1 - t)
        r_raw = _logret(P[t + step], P[t])
        fee = cfg.fees + cfg.slippage

        if action == "long":
            lr = size * (r_raw - fee)
        elif action == "short":
            lr = size * (-r_raw - fee)
        else:
            lr = 0.0

        logret_series.append(lr)
        equity *= float(np.exp(lr))
        eq_curve.append((t + step, equity))
        t += step

    metrics = _equity_metrics(np.array(logret_series), cfg.annualization)
    # empaquetar curva
    idxs = [i for (i, _) in eq_curve]
    vals = [v for (_, v) in eq_curve]

    return {
        "metrics": {
            **metrics,
            "n_steps": len(logret_series),
            "stride": cfg.stride,
            "fees": cfg.fees,
            "slippage": cfg.slippage,
            "horizon": cfg.horizon,
            "alpha": cfg.alpha,
        },
        "counts": counts,
        "equity_curve": {
            "index": idxs,
            "equity": vals,
            "timestamps": [timestamps[i] if timestamps else None for i in idxs],
        }
    }
