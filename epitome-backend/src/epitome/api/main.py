from __future__ import annotations
from typing import List, Dict, Optional
import time
import numpy as np
from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..config import settings
from ..obs.logging import setup_logging
from ..obs.metrics import (
    HTTP_REQUESTS, HTTP_LATENCY,
    FORECAST_LATENCY, RISK_CALLS, REGIME_CALLS, SIGNALS_CALLS, SIGNALS_ACTION,
)
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from ..service.statsforecast_model import train_and_forecast_stats
from ..service.conformal import ConformalCalibrator
from ..service.regime import hmm_regime
from ..service.risk import risk_garch_var_es
from ..service.policy import compute_signal, SignalConfig

logger = setup_logging()

app = FastAPI(title="KleverGold EPITOME API", version="0.4.0")

# CORS (configurable por EPITOME_ALLOWED_ORIGINS="*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========= Middleware de métricas =========
@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        dur = time.perf_counter() - start
        route = request.url.path
        HTTP_REQUESTS.labels(request.method, route, str(status)).inc()
        HTTP_LATENCY.labels(request.method, route).observe(dur)

# ========= Schemas =========
class ForecastReq(BaseModel):
    timestamps: List[str]
    price: List[float]
    exog: Optional[Dict[str, List[float]]] = None
    horizon: int = Field(default=24, ge=1, le=500)

class ForecastRes(BaseModel):
    quantiles: Dict[str, List[float]]  # q05,q10,q50,q90,q95
    regime: str
    coverage_target: float

class RegimeReq(BaseModel):
    timestamps: List[str]
    price: List[float]

class RegimeRes(BaseModel):
    regime: str
    p_bull: float
    p_bear: float
    p_chop: float

class RiskReq(BaseModel):
    timestamps: List[str]
    price: List[float]
    alpha: float = Field(default=0.05, gt=0, lt=0.5)

class RiskRes(BaseModel):
    sigma: float  # vol condicional 1-step (decimales)
    mu: float     # media condicional 1-step (decimales)
    var: float    # VaR (decimales) cola izquierda
    es: float     # ES (decimales) cola izquierda
    alpha: float

class SignalsReq(BaseModel):
    timestamps: List[str]
    price: List[float]
    horizon: int = Field(default=24, ge=1, le=500)
    alpha: float = Field(default=0.05, gt=0, lt=0.5)

class SignalsRes(BaseModel):
    action: str
    horizon: int
    price0: float
    target: float
    stop: float
    takeprofit: float
    confidence: float
    position_size: float
    regime: str
    p_bull: float
    p_bear: float
    p_chop: float
    metrics: Dict[str, float]
    quantiles: Dict[str, List[float]]

# ========= Endpoints =========
@app.get("/health")
def health():
    return {"ok": True, "version": "0.4.0"}

@app.get("/metrics")
def metrics():
    # Exposición Prometheus
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/forecast", response_model=ForecastRes)
def forecast(req: ForecastReq):
    prices = np.array(req.price, dtype=float)
    if prices.size < 60:
        raise HTTPException(status_code=400, detail="Se requieren al menos 60 precios.")
    t0 = time.perf_counter()
    try:
        base = train_and_forecast_stats(prices, req.timestamps, horizon=req.horizon, calib_len=None)

        # Calibración conformal empírica multi-h
        calibr = ConformalCalibrator(alpha_low=0.05, alpha_high=0.95)
        q05, q10, q50, q90, q95 = calibr.apply(
            q50=base["q50_base"],
            q10=base["q10_base"],
            q90=base["q90_base"],
            q05=base["q05_base"],
            q95=base["q95_base"],
            residuals=base["residuals"],
        )

        # Régimen con HMM sobre retornos históricos
        rets = np.diff(np.log(prices))
        regime, _, _, _ = hmm_regime(rets)

        return ForecastRes(
            quantiles={"q05": q05.tolist(), "q10": q10.tolist(), "q50": q50.tolist(), "q90": q90.tolist(), "q95": q95.tolist()},
            regime=regime,
            coverage_target=0.90,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/forecast error: {e}")
        raise HTTPException(status_code=500, detail=f"forecast_error: {e}")
    finally:
        FORECAST_LATENCY.observe(time.perf_counter() - t0)

@app.post("/regime", response_model=RegimeRes)
def regime(req: RegimeReq):
    prices = np.array(req.price, dtype=float)
    if prices.size < 60:
        raise HTTPException(status_code=400, detail="Se requieren al menos 60 precios.")
    REGIME_CALLS.inc()
    rets = np.diff(np.log(prices))
    try:
        regime, p_bull, p_bear, p_chop = hmm_regime(rets)
        return RegimeRes(regime=regime, p_bull=p_bull, p_bear=p_bear, p_chop=p_chop)
    except Exception as e:
        logger.error(f"/regime error: {e}")
        raise HTTPException(status_code=500, detail=f"regime_error: {e}")

@app.post("/risk", response_model=RiskRes)
def risk(req: RiskReq):
    prices = np.array(req.price, dtype=float)
    if prices.size < 120:
        raise HTTPException(status_code=400, detail="Se requieren al menos 120 precios.")
    RISK_CALLS.inc()
    rets = np.diff(np.log(prices))
    try:
        r = risk_garch_var_es(rets, alpha=req.alpha)
        return RiskRes(**r)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"/risk error: {e}")
        raise HTTPException(status_code=500, detail=f"risk_error: {e}")

@app.post("/signals", response_model=SignalsRes)
def signals(req: SignalsReq):
    prices = np.array(req.price, dtype=float)
    if prices.size < 120:
        raise HTTPException(status_code=400, detail="Se requieren al menos 120 precios.")
    try:
        out = compute_signal(prices, req.timestamps, cfg=SignalConfig(alpha=req.alpha, horizon=req.horizon))
        SIGNALS_CALLS.inc()
        SIGNALS_ACTION.labels(out["action"]).inc()
        return SignalsRes(**out)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"/signals error: {e}")
        raise HTTPException(status_code=500, detail=f"signals_error: {e}")
