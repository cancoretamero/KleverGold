from __future__ import annotations
from typing import List, Dict, Optional
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..config import settings
from ..service.statsforecast_model import train_and_forecast_stats
from ..service.conformal import ConformalCalibrator
from ..service.regime import hmm_regime
from ..service.risk import risk_garch_var_es

app = FastAPI(title="KleverGold EPITOME API", version="0.2.0")

# CORS (configurable por EPITOME_ALLOWED_ORIGINS="*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


# ========= Endpoints =========
@app.get("/health")
def health():
    return {"ok": True, "version": "0.2.0"}


@app.post("/forecast", response_model=ForecastRes)
def forecast(req: ForecastReq):
    prices = np.array(req.price, dtype=float)
    if prices.size < 60:
        raise HTTPException(status_code=400, detail="Se requieren al menos 60 precios.")

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
        regime, p_bull, p_bear, p_chop = hmm_regime(rets)

        return ForecastRes(
            quantiles={
                "q05": q05.tolist(),
                "q10": q10.tolist(),
                "q50": q50.tolist(),
                "q90": q90.tolist(),
                "q95": q95.tolist(),
            },
            regime=regime,
            coverage_target=0.90,  # objetivo típico; ajustable
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"forecast_error: {e}")


@app.post("/regime", response_model=RegimeRes)
def regime(req: RegimeReq):
    prices = np.array(req.price, dtype=float)
    if prices.size < 60:
        raise HTTPException(status_code=400, detail="Se requieren al menos 60 precios.")
    rets = np.diff(np.log(prices))
    try:
        regime, p_bull, p_bear, p_chop = hmm_regime(rets)
        return RegimeRes(regime=regime, p_bull=p_bull, p_bear=p_bear, p_chop=p_chop)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"regime_error: {e}")


@app.post("/risk", response_model=RiskRes)
def risk(req: RiskReq):
    prices = np.array(req.price, dtype=float)
    if prices.size < 120:
        raise HTTPException(status_code=400, detail="Se requieren al menos 120 precios.")
    rets = np.diff(np.log(prices))
    try:
        r = risk_garch_var_es(rets, alpha=req.alpha)
        return RiskRes(**r)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"risk_error: {e}")
