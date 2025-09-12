from __future__ import annotations
import numpy as np
from dataclasses import dataclass


def _q(x: np.ndarray, p: float) -> float:
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    if x.size == 0:
        return 0.0
    return float(np.quantile(x, p))


@dataclass
class ConformalCalibrator:
    """
    Calibración conformal empírica multi-horizonte (aprox).
    Usa residuales de un bloque de calibración y los escala ~ sqrt(h).
    """
    alpha_low: float = 0.05
    alpha_high: float = 0.95

    def apply(
        self,
        q50: np.ndarray,
        q10: np.ndarray,
        q90: np.ndarray,
        q05: np.ndarray,
        q95: np.ndarray,
        residuals: np.ndarray,
    ):
        n = len(q50)
        out05 = np.empty(n)
        out10 = np.empty(n)
        out50 = np.array(q50, copy=True)
        out90 = np.empty(n)
        out95 = np.empty(n)

        # cuantiles empíricos de residuales
        e05 = _q(residuals, self.alpha_low)
        e10 = _q(residuals, 0.10)
        e90 = _q(residuals, 0.90)
        e95 = _q(residuals, self.alpha_high)

        for i in range(n):
            s = np.sqrt(max(1, i + 1))  # escalado por horizonte
            out05[i] = out50[i] + e05 * s
            out10[i] = out50[i] + e10 * s
            out90[i] = out50[i] + e90 * s
            out95[i] = out50[i] + e95 * s

        # aseguramos orden q05 <= q10 <= q50 <= q90 <= q95
        stacked = np.vstack([out05, out10, out50, out90, out95])
        stacked_sorted = np.sort(stacked, axis=0)
        out05, out10, out50, out90, out95 = stacked_sorted

        return out05, out10, out50, out90, out95
