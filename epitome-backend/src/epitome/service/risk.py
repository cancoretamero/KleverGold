from __future__ import annotations
import numpy as np
from typing import Dict
from arch.univariate import arch_model
import math


def _z(p: float) -> float:
    # aproximación rápida de ppf normal (mismo método que utilidades)
    a = 0.147
    s = 2 * p - 1
    ln = math.log(1 - s * s)
    part = (2 / (math.pi * a) + ln / 2)
    return math.copysign(math.sqrt(math.sqrt(part**2 - ln / a) - part), s)


def _phi(z: float) -> float:
    # pdf normal estándar
    return (1 / math.sqrt(2 * math.pi)) * math.exp(-0.5 * z * z)


def risk_garch_var_es(returns: np.ndarray, alpha: float = 0.05) -> Dict[str, float]:
    """
    GARCH(1,1) con distribución normal para VaR/ES de 1 paso.
    Retornos en decimales (no %). Devuelve dict con var, es, sigma.
    """
    r = np.asarray(returns, dtype=float)
    r = r[np.isfinite(r)]
    if r.size < 100:
        raise ValueError("Se requieren >=100 retornos para GARCH.")

    # Escalamos a % para estabilidad numérica
    r_pct = r * 100.0
    am = arch_model(r_pct, mean="Constant", vol="GARCH", p=1, q=1, dist="normal")
    res = am.fit(disp="off")
    f = res.forecast(horizon=1, reindex=False)
    mu = float(f.mean.values[-1, 0])
    var = float(f.variance.values[-1, 0])
    sigma = math.sqrt(max(1e-12, var))

    za = _z(alpha)  # negativo (ej.: z(0.05) ~ -1.645)
    var1 = mu + sigma * za  # VaR en %
    es1 = mu - sigma * (_phi(za) / alpha)  # ES (cola izquierda) en %

    # des-escalar a decimales
    return {
        "sigma": sigma / 100.0,
        "mu": mu / 100.0,
        "var": var1 / 100.0,
        "es": es1 / 100.0,
        "alpha": alpha,
    }
