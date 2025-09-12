# server/main.py — Epitome v1 (compatible con el frontend de KleverGold)
import os, math
from datetime import datetime
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

# Modelos clásicos
import pmdarima as pm
from statsmodels.tsa.exponential_smoothing.ets import ETSModel
from hmmlearn.hmm import GaussianHMM
from arch import arch_model

# Métricas Prometheus
from prometheus_client import Counter, Histogram, CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST

# -----------------------------
# App & CORS
# -----------------------------
ALLOW_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "*")
ORIGINS = [o.strip() for o in ALLOW_ORIGINS.split(",")] if ALLOW_ORIGINS else ["*"]

app = FastAPI(title="KleverGold Epitome v1", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

# -----------------------------
# Prometheus
# -----------------------------
REGISTRY = CollectorRegistry(auto_describe=True)
REQ_COUNTER = Counter("epitome_requests_total", "Total requests", ["endpoint", "method"], registry=REGISTRY)
REQ_DURATION = Histogram("epitome_request_duration_seconds", "Request duration", ["endpoint", "method"], registry=REGISTRY)

def now_utc_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"

# -----------------------------
# Helpers de parsing
# -----------------------------
def _payload_to_series(payload: Dict[str, Any]) -> pd.Series:
    """Convierte el payload del front a pd.Series de precios (índice datetime)."""
    if "series" in payload and isinstance(payload["series"], list):
        rows = payload["series"]
        ds = [pd.to_datetime(r.get("date")) for r in rows]
        y = [float(r.get("close")) for r in rows]
    elif "timestamps" in payload and "price" in payload:
        ts = payload["timestamps"]; px = payload["price"]
        if len(ts) != len(px):
            raise ValueError("timestamps y price deben tener la misma longitud")
        ds = [pd.to_datetime(t) for t in ts]
        y = [float(v) for v in px]
    else:
        raise ValueError("Formato inválido: usa 'series' o 'timestamps'+'price'")

    df = pd.DataFrame({"ds": ds, "y": y}).dropna().sort_values("ds")
    df = df.drop_duplicates(subset="ds", keep="last")
    if len(df) < 60:
        raise ValueError("Se requieren al menos 60 observaciones")
    return pd.Series(df["y"].values, index=pd.DatetimeIndex(df["ds"].values), name="y")

def _residual_quantiles(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    resid = y_true - y_pred
    if len(resid) < 20:
        s = float(np.nanstd(resid)) if len(resid) else 0.0
        return {"q05": -1.645 * s, "q10": -1.282 * s, "q90": 1.282 * s, "q95": 1.645 * s}
    return {
        "q05": float(np.nanpercentile(resid, 5)),
        "q10": float(np.nanpercentile(resid, 10)),
        "q90": float(np.nanpercentile(resid, 90)),
        "q95": float(np.nanpercentile(resid, 95)),
    }

# -----------------------------
# Núcleo: Forecast (ARIMA + ETS)
# -----------------------------
def forecast_core(y: pd.Series, h: int, coverage: float = 0.9) -> Dict[str, List[float]]:
    # 1) ARIMA
    try:
        arima = pm.auto_arima(
            y.values, seasonal=False, stepwise=True, suppress_warnings=True,
            error_action="ignore", max_order=10
        )
        arima_pred = arima.predict(h)
        ins = arima.predict_in_sample()
        arima_q = _residual_quantiles(y.values[-len(ins):], ins)
    except Exception:
        arima_pred = np.full(h, np.nan); arima_q = {"q05":0.0,"q10":0.0,"q90":0.0,"q95":0.0}

    # 2) ETS (add-error, sin tendencia/estacionalidad)
    try:
        ets = ETSModel(y, error="add", trend=None, seasonal=None, initialization_method="estimated").fit(disp=False)
        ets_pred = ets.forecast(h)
        fitted = ets.fittedvalues
        m = min(len(fitted), len(y))
        ets_q = _residual_quantiles(y.values[-m:], fitted.values[-m:])
    except Exception:
        ets_pred = np.full(h, np.nan); ets_q = {"q05":0.0,"q10":0.0,"q90":0.0,"q95":0.0}

    preds = np.vstack([p for p in [arima_pred, np.array(ets_pred)] if np.isfinite(p).all()])
    if preds.size == 0:
        raise RuntimeError("No fue posible ajustar ARIMA/ETS")

    q50 = np.nanmean(preds, axis=0)

    q05_err = np.nanmean([arima_q["q05"], ets_q["q05"]]); q10_err = np.nanmean([arima_q["q10"], ets_q["q10"]])
    q90_err = np.nanmean([arima_q["q90"], ets_q["q90"]]); q95_err = np.nanmean([arima_q["q95"], ets_q["q95"]])

    q05, q10, q90, q95 = [], [], [], []
    for i in range(h):
        scale = math.sqrt(max(1, i + 1))
        q05.append(float(q50[i] + q05_err * scale))
        q10.append(float(q50[i] + q10_err * scale))
        q90.append(float(q50[i] + q90_err * scale))
        q95.append(float(q50[i] + q95_err * scale))

    return {"q05": q05, "q10": q10, "q50": q50.tolist(), "q90": q90, "q95": q95, "coverage": coverage}

# -----------------------------
# Núcleo: Régimen (HMM 3 estados)
# -----------------------------
def regime_core(y: pd.Series) -> Dict[str, Any]:
    y = y.dropna()
    if len(y) < 200:  # robustez
        return {"regime": "chop", "p_bull": 0.33, "p_bear": 0.33, "p_chop": 0.34}

    rets = np.log(y / y.shift(1)).dropna().values.reshape(-1, 1)
    hmm = GaussianHMM(n_components=3, covariance_type="full", n_iter=200, random_state=42)
    hmm.fit(rets)
    _, post = hmm.score_samples(rets)
    last = post[-1]

    means = hmm.means_.flatten(); order = np.argsort(means)
    mapping = {order[0]: "bear", order[1]: "chop", order[2]: "bull"}
    p = {mapping[i]: float(last[i]) for i in range(3)}
    regime = max(p.items(), key=lambda kv: kv[1])[0]
    return {"regime": regime, "p_bull": p.get("bull",0.0), "p_bear": p.get("bear",0.0), "p_chop": p.get("chop",0.0)}

# -----------------------------
# Núcleo: Riesgo (sigma/μ, VaR, ES)
# -----------------------------
def risk_core(y: pd.Series, alpha: float = 0.05) -> Dict[str, Any]:
    y = y.dropna()
    rets = np.log(y / y.shift(1)).dropna()  # rendimientos log diarios

    # Métricas históricas
    if len(rets) < 60:
        raise RuntimeError("Serie demasiado corta para riesgo")

    # GARCH(1,1) con escala en % para estabilidad numérica
    warnings = []
    try:
        am = arch_model(rets * 100, p=1, q=1, mean="constant", vol="Garch", dist="t")
        res = am.fit(disp="off")
        f = res.forecast(horizon=1)
        var_next = float(f.variance.iloc[-1, 0])            # (%^2)
        sigma = math.sqrt(var_next) / 100.0                 # → fracción diaria
        mu = float(res.params.get("mu", rets.mean() * 100)) / 100.0
    except Exception:
        warnings.append("GARCH fallback to historical moments")
        sigma = float(np.std(rets))                         # fracción diaria
        mu = float(np.mean(rets))

    q = float(np.percentile(rets, alpha*100.0))            # VaR (cuantil de pérdidas)
    es_mask = rets <= q
    es = float(rets[es_mask].mean()) if es_mask.any() else q

    return {"sigma": sigma, "mu": mu, "var": q, "es": es, "alpha": alpha, "warnings": warnings}

# -----------------------------
# Endpoints
# -----------------------------
@app.get("/health")
def health():
    REQ_COUNTER.labels(endpoint="/health", method="GET").inc()
    return {"ok": True, "ts": now_utc_iso()}

@app.post("/forecast")
async def forecast_ep(request: Request):
    with REQ_DURATION.labels(endpoint="/forecast", method="POST").time():
        REQ_COUNTER.labels(endpoint="/forecast", method="POST").inc()
        try:
            payload = await request.json()
            y = _payload_to_series(payload)
            horizon = int(payload.get("horizon", 24))
            coverage = float(payload.get("coverage", 0.9))
            q = forecast_core(y, horizon, coverage)
            reg = regime_core(y)
            return {
                "generated_at": now_utc_iso(),
                "coverage_target": q["coverage"],
                "quantiles": {k: q[k] for k in ["q05","q10","q50","q90","q95"]},
                "regime": reg["regime"]
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

@app.post("/regime")
async def regime_ep(request: Request):
    with REQ_DURATION.labels(endpoint="/regime", method="POST").time():
        REQ_COUNTER.labels(endpoint="/regime", method="POST").inc()
        try:
            payload = await request.json()
            y = _payload_to_series(payload)
            return {"generated_at": now_utc_iso(), **regime_core(y)}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

@app.post("/risk")
async def risk_ep(request: Request):
    with REQ_DURATION.labels(endpoint="/risk", method="POST").time():
        REQ_COUNTER.labels(endpoint="/risk", method="POST").inc()
        try:
            payload = await request.json()
            y = _payload_to_series(payload)
            alpha = float(payload.get("alpha", 0.05))
            out = risk_core(y, alpha)
            return {"generated_at": now_utc_iso(), **out}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

@app.get("/metrics")
def metrics():
    REQ_COUNTER.labels(endpoint="/metrics", method="GET").inc()
    data = generate_latest(REGISTRY)
    return app.response_class(data, media_type=CONTENT_TYPE_LATEST)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
