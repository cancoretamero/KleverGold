from __future__ import annotations
import numpy as np
from typing import Tuple
from hmmlearn.hmm import GaussianHMM


def hmm_regime(returns: np.ndarray, n_states: int = 3) -> Tuple[str, float, float, float]:
    r = np.asarray(returns, dtype=float)
    r = r[np.isfinite(r)]
    if r.size < 60:
        return "unknown", 0.34, 0.33, 0.33

    X = r.reshape(-1, 1)
    model = GaussianHMM(n_components=n_states, covariance_type="full", n_iter=200, tol=1e-4, random_state=42)
    model.fit(X)

    # Posterior (responsabilidades gamma) por muestra
    # score_samples devuelve (logprob, posteriors)
    _, post = model.score_samples(X)
    last_p = post[-1]  # probs del último instante

    # ordenar estados por media
    means = model.means_.flatten()
    order = np.argsort(means)  # low ... high
    bear_idx, chop_idx, bull_idx = order[0], order[1], order[2]

    p_bear = float(last_p[bear_idx])
    p_chop = float(last_p[chop_idx])
    p_bull = float(last_p[bull_idx])

    if p_bull == max(p_bull, p_bear, p_chop):
        label = "bull"
    elif p_bear == max(p_bull, p_bear, p_chop):
        label = "bear"
    else:
        label = "chop"

    return label, p_bull, p_bear, p_chop
