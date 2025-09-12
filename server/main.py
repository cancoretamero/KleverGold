# server/main.py
# Epitome v1 — FastAPI para KleverGold
#
# Endpoints:
#  - GET  /health
#  - POST /forecast
#  - POST /regime
#  - POST /risk
#  - GET  /metrics  (Prometheus)
#
# Diseño:
#  - Predicción: ensamble simple (AutoARIMA + ETS) → mediana (q50).
#  - Intervalos: residuales empíricos (q05, q10, q90, q95) escalados por sqrt(h).
#  - Régimen: HMM 3 estados (bull/bear/chop) sobre retornos log.
#  - Riesgo: sigma histórica + GARCH(1,1) (fallback si falla) y VaR/ES históricas.

import os
import math
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator

import orjson

# Modelos clásicos
import pmdarima as pm
from statsmodels.tsa.exponential_smoothing.ets import ETSModel
from hmmlearn.hmm import GaussianHMM
from arch import arch_model

# Métricas Prometheus
from prometheus_client import Counter, Histogram, CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST

# -----------------------------
# Config / CORS
# -----------------------------
ALLOW_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "*")
ORIGINS = [o.strip() for o in ALLOW_ORIGINS.split(",")] if ALLOW_ORIGINS else ["*"]

app = FastAPI(title="KleverGold Epitome v1", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
# Schemas
# -----------------------------
class PricePoint(BaseModel):
    date: str
    close: float

    @validator("date")
    def check_date(cls, v):
        # acepta YYYY-mm-dd o iso
        try:
            _ = pd.to_datetime(v)
        except Exception:
            raise ValueError("date must be parseable")
        return v

class ForecastRequest(BaseModel):
    series: List[PricePoint]
    horizon: int = Field(24, ge=1, le=365)
    freq: Literal["D"] = "D"
    coverage: float = Field(0.9, gt=0.5, lt=0.999)

class ForecastPoint(BaseModel):
    ds: str
    h: int
    q05: float
    q10: float
    q50: float
    q90: float
    q95: float

class ForecastResponse(BaseModel):
    generated_at: str
    coverage: float
    points: List[ForecastPoint]

class RegimeRequest(BaseModel):
    series: List[PricePoint]
    lookback: int = Field(1000, ge=100, le=10000)

class RegimeResponse(BaseModel):
    generated_at: str
    regime: Literal["bull", "bear", "chop"]
    p_bull: float
    p_bear: float
    p_chop: float
    state_means: Dict[str, float]

class RiskRequest(BaseModel):
    series: List[PricePoint]
    lookback: int = Field(500, ge=100, le=5000)
    alpha: float = Field(0.95, gt=0.5, lt=0.999)  # VaR/ES

class RiskResponse(BaseModel):
    generated_at: str
    last_price: float
    sigma_1d: float     # desviación estándar diaria (en %)
    var_pct: float      # VaR a 1d, en %
    es_pct: float       # ES a 1d, en %
    warnings: Optional[List[str]] = None

# -----------------------------
# Utils
# -----------------------------
def _series_to_pd(req_series: List[PricePoint]) -> pd.Series:
    df = pd.DataFrame([{"ds": pd.to_datetime(x.date), "y": float(x.close)} for x in req_series])
    df = df.dropna().sort_values("ds")
    # deduplicate by last
    df = df.drop_duplicates(subset="ds", keep="last")
    s = pd.Series(df["y"].values, index=pd.DatetimeIndex(df["ds"].values), name="y")
    return s

def _future_index(last_dt: pd.Timestamp, h: int, freq: str = "D") -> pd.DatetimeIndex:
    return pd.date_range(start=last_dt + pd.tseries.frequencies.to_offset(freq), periods=h, freq=freq)

def _residual_quantiles(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    resid = y_true - y_pred
    if len(resid) < 20:
        # fallback robusto
        s = float(np.nanstd(resid)) if len(resid) else 0.0
        return {"q05": -1.645 * s, "q10": -1.282 * s, "q90": 1.282 * s, "q95": 1.645 * s}
    return {
        "q05": float(np.nanpercentile(resid, 5)),
        "q10": float(np.nanpercentile(resid, 10)),
        "q90": float(np.nanpercentile(resid, 90)),
        "q95": float(np.nanpercentile(resid, 95)),
    }

def _safe_float(x: Any) -> float:
    try:
        return float(x)
    except Exception:
        return float("nan")

# -----------------------------
# Core: Forecast (AutoARIMA + ETS)
# -----------------------------
def forecast_core(y: pd.Series, h: int, coverage: float = 0.9) -> pd.DataFrame:
    """
    Devuelve DataFrame con columnas: ['ds','arima','ets','median','q05','q10','q90','q95']
    """
    # Modelos base
    # 1) AutoARIMA
    try:
        arima = pm.auto_arima(
            y.values,
            seasonal=False,
            stepwise=True,
            suppress_warnings=True,
            error_action="ignore",
            max_order=10,
        )
        arima_pred = arima.predict(h)
        # one-step backcast para residuales
        insample_pred = arima.predict_in_sample()
        arima_resid_q = _residual_quantiles(y.values[-len(insample_pred):], insample_pred)
    except Exception:
        arima_pred = np.full(h, np.nan)
        # fallback residuales
        arima_resid_q = {"q05": 0.0, "q10": 0.0, "q90": 0.0, "q95": 0.0}

    # 2) ETS (Holt-Winters sin tendencia, sin estacionalidad para oro diario)
    try:
        ets_model = ETSModel(y, error="add", trend=None, seasonal=None, initialization_method="estimated")
        ets_fit = ets_model.fit(disp=False)
        ets_pred = ets_fit.forecast(h)
        # residuales in-sample
        ets_fitted = ets_fit.fittedvalues
        m = min(len(ets_fitted), len(y))
        ets_resid_q = _residual_quantiles(y.values[-m:], ets_fitted.values[-m:])
    except Exception:
        ets_pred = np.full(h, np.nan)
        ets_resid_q = {"q05": 0.0, "q10": 0.0, "q90": 0.0, "q95": 0.0}

    # Mediana (q50) = promedio de modelos válidos
    preds = np.vstack([p for p in [arima_pred, np.array(ets_pred)] if np.isfinite(p).all()])
    if preds.size == 0:
        raise RuntimeError("No fue posible ajustar modelos base (ARIMA/ETS).")
    q50 = np.nanmean(preds, axis=0)

    # Calibración simple de cuantiles con residuales empíricos (conformal básico)
    # Escala por sqrt(h) para horizontes crecientes
    # Mezcla residuales de ambos modelos (promedio)
    q05_err = np.nanmean([arima_resid_q["q05"], ets_resid_q["q05"]])
    q10_err = np.nanmean([arima_resid_q["q10"], ets_resid_q["q10"]])
    q90_err = np.nanmean([arima_resid_q["q90"], ets_resid_q["q90"]])
    q95_err = np.nanmean([arima_resid_q["q95"], ets_resid_q["q95"]])

    q05_list, q10_list, q90_list, q95_list = [], [], [], []
    for i in range(h):
        scale = math.sqrt(max(1, i + 1))
        q05_list.append(q50[i] + q05_err * scale)
        q10_list.append(q50[i] + q10_err * scale)
        q90_list.append(q50[i] + q90_err * scale)
        q95_list.append(q50[i] + q95_err * scale)

    idx = _future_index(y.index[-1], h, "D")
    df = pd.DataFrame({
        "ds": idx,
        "q50": q50,
        "q05": q05_list,
        "q10": q10_list,
        "q90": q90_list,
        "q95": q95_list
    })
    return df

# -----------------------------
# Core: Regime (HMM 3 estados)
# -----------------------------
def regime_core(y: pd.Series, lookback: int = 1000) -> Dict[str, Any]:
    y = y.dropna()
    if len(y) < 200:
        raise RuntimeError("Serie demasiado corta para HMM.")
    y_tail = y.iloc[-min(lookback, len(y)):]
    rets = np.log(y_tail / y_tail.shift(1)).dropna().values.reshape(-1, 1)

    hmm = GaussianHMM(n_components=3, covariance_type="full", n_iter=200, random_state=42)
    hmm.fit(rets)
    # probabilidades a posteriori
    logprob, post = hmm.score_samples(rets)
    last_post = post[-1]  # shape (3,)

    means = hmm.means_.flatten()
    order = np.argsort(means)  # 0: bear (más bajo), 1: chop, 2: bull (más alto)
    mapping = {order[0]: "bear", order[1]: "chop", order[2]: "bull"}

    # mapear last_post a etiquetas
    p = {mapping[i]: float(last_post[i]) for i in range(3)}
    regime = max(p.items(), key=lambda kv: kv[1])[0]

    state_means = {mapping[i]: float(means[i]) for i in range(3)}

    return {
        "regime": regime,
        "p_bull": p.get("bull", 0.0),
        "p_bear": p.get("bear", 0.0),
        "p_chop": p.get("chop", 0.0),
        "state_means": state_means
    }

# -----------------------------
# Core: Riesgo (sigma, VaR, ES)
# -----------------------------
def risk_core(y: pd.Series, lookback: int = 500, alpha: float = 0.95) -> Dict[str, Any]:
    y = y.dropna()
    last_price = float(y.iloc[-1])
    y_tail = y.iloc[-min(lookback + 10, len(y)):]
    rets = np.log(y_tail / y_tail.shift(1)).dropna()  # retornos log diarios

    warnings = []
    # Sigma histórica (en %)
    sigma_hist = float(np.std(rets) * 100.0)

    # VaR/ES históricas
    q = float(np.percentile(rets, (1 - alpha) * 100.0))
    var_pct = -q * 100.0  # pérdidas como positivo
    es_mask = rets <= q
    es_pct = -float(rets[es_mask].mean() * 100.0) if es_mask.any() else var_pct

    # GARCH(1,1) para sigma condicional (fallback si falla)
    try:
        am = arch_model(rets * 100, p=1, q=1, mean="constant", vol="Garch", dist="t")
        res = am.fit(disp="off")
        f = res.forecast(horizon=1)
        var = float(f.variance.iloc[-1, 0])  # en (%^2)
        sigma_garch = math.sqrt(var)  # en %
        sigma_1d = sigma_garch
    except Exception:
        warnings.append("GARCH fallback to historical sigma")
        sigma_1d = sigma_hist

    return {
        "last_price": last_price,
        "sigma_1d": sigma_1d,
        "var_pct": var_pct,
        "es_pct": es_pct,
        "warnings": warnings
    }

# -----------------------------
# Routes
# -----------------------------
@app.get("/health")
def health():
    REQ_COUNTER.labels(endpoint="/health", method="GET").inc()
    return {"ok": True, "ts": now_utc_iso()}

@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    with REQ_DURATION.labels(endpoint="/forecast", method="POST").time():
        REQ_COUNTER.labels(endpoint="/forecast", method="POST").inc()

        y = _series_to_pd(req.series)
        if len(y) < 60:
            raise HTTPException(status_code=400, detail="Se requieren al menos 60 puntos diarios.")

        df = forecast_core(y, req.horizon, req.coverage)
        points = [
            ForecastPoint(
                ds=str(df["ds"].iloc[i].date()),
                h=i + 1,
                q05=_safe_float(df["q05"].iloc[i]),
                q10=_safe_float(df["q10"].iloc[i]),
                q50=_safe_float(df["q50"].iloc[i]),
                q90=_safe_float(df["q90"].iloc[i]),
                q95=_safe_float(df["q95"].iloc[i]),
            )
            for i in range(len(df))
        ]
        return ForecastResponse(generated_at=now_utc_iso(), coverage=req.coverage, points=points)

@app.post("/regime", response_model=RegimeResponse)
def regime(req: RegimeRequest):
    with REQ_DURATION.labels(endpoint="/regime", method="POST").time():
        REQ_COUNTER.labels(endpoint="/regime", method="POST").inc()

        y = _series_to_pd(req.series)
        out = regime_core(y, req.lookback)
        return RegimeResponse(generated_at=now_utc_iso(), **out)

@app.post("/risk", response_model=RiskResponse)
def risk(req: RiskRequest):
    with REQ_DURATION.labels(endpoint="/risk", method="POST").time():
        REQ_COUNTER.labels(endpoint="/risk", method="POST").inc()

        y = _series_to_pd(req.series)
        out = risk_core(y, req.lookback, req.alpha)
        return RiskResponse(generated_at=now_utc_iso(), **out)

@app.get("/metrics")
def metrics():
    REQ_COUNTER.labels(endpoint="/metrics", method="GET").inc()
    data = generate_latest(REGISTRY)
    return app.response_class(data, media_type=CONTENT_TYPE_LATEST)

# Entrypoint local
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
