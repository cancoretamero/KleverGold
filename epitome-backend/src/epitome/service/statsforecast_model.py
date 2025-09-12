from __future__ import annotations
import numpy as np
import pandas as pd
from typing import Dict, Tuple
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, ETS


def _infer_freq(ts: pd.DatetimeIndex) -> str:
    try:
        f = pd.infer_freq(ts)
        if f is None:
            return "D"
        # normalizamos algunas frecuencias
        if f.upper().startswith("D"):
            return "D"
        if f.upper().startswith("H"):
            return "H"
        return f
    except Exception:
        return "D"


def _build_df(prices: np.ndarray, timestamps: list[str]) -> Tuple[pd.DataFrame, str]:
    y = np.asarray(prices, dtype=float)
    if timestamps and len(timestamps) == len(y):
        ds = pd.to_datetime(timestamps, utc=True)
    else:
        # si no hay timestamps válidos, construimos rango diario ficticio
        ds = pd.date_range("2000-01-01", periods=len(y), freq="D", tz="UTC")
    freq = _infer_freq(pd.DatetimeIndex(ds))
    df = pd.DataFrame({"unique_id": "xauusd", "ds": ds.tz_convert(None), "y": y})
    return df, freq


def _combine_quantiles(pred_df: pd.DataFrame, models: list[str], level: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Combina por media simple los intervalos lo/hi de todos los modelos al 'level' (%).
    """
    los, his = [], []
    for m in models:
        lo_col = f"{m}-lo-{level}"
        hi_col = f"{m}-hi-{level}"
        if lo_col in pred_df and hi_col in pred_df:
            los.append(pred_df[lo_col].to_numpy())
            his.append(pred_df[hi_col].to_numpy())
    if not los:
        raise RuntimeError("No hay columnas lo/hi en predicción StatsForecast.")
    lo = np.mean(np.vstack(los), axis=0)
    hi = np.mean(np.vstack(his), axis=0)
    return lo, hi


def train_and_forecast_stats(
    prices: np.ndarray,
    timestamps: list[str] | None,
    horizon: int = 24,
    calib_len: int | None = None,
) -> Dict[str, np.ndarray]:
    """
    1) Split en train/calib para obtener residuales (conformal).
    2) Fit modelos (AutoARIMA, ETS) y combinar por media.
    3) Predecir horizonte y devolver cuantiles base + residuales de calibración.
    """
    df_full, freq = _build_df(prices, timestamps or [])
    n = len(df_full)
    if n < 60:
        raise ValueError("Se requieren >= 60 observaciones para StatsForecast.")

    # longitud de calibración (cola) ~ 1/3, acotada [30, 400]
    if calib_len is None:
        calib_len = int(max(30, min(n // 3, 400)))
    train_end = n - calib_len
    if train_end < 30:
        train_end = max(30, n - 30)
        calib_len = n - train_end

    models = [AutoARIMA(season_length=7), ETS(season_length=7, model="AAN")]
    model_names = ["AutoARIMA", "ETS"]

    # ===== Calibración: entrenar en train y predecir calib_len =====
    sfc = StatsForecast(models=models, freq=freq, n_jobs=1)
    df_train = df_full.iloc[:train_end].copy()
    sfc.fit(df_train, y_col="y")
    pred_calib = sfc.predict(h=calib_len, level=[80, 90, 95])
    # mediana base = media de medianas de modelos
    med_cols = [m for m in model_names if m in pred_calib.columns]
    if not med_cols:
        raise RuntimeError("No hay columnas de medianas en predicción StatsForecast (calibración).")
    medians_calib = pred_calib[med_cols].to_numpy().mean(axis=1)
    y_calib_true = df_full["y"].iloc[train_end:].to_numpy()
    residuals = y_calib_true - medians_calib

    # ===== Producción: entrenar en todo y predecir horizonte =====
    sff = StatsForecast(models=models, freq=freq, n_jobs=1)
    sff.fit(df_full, y_col="y")
    pred = sff.predict(h=horizon, level=[80, 90, 95])

    # mediana combinada
    med_cols = [m for m in model_names if m in pred.columns]
    median = pred[med_cols].to_numpy().mean(axis=1)

    lo80, hi80 = _combine_quantiles(pred, model_names, 80)
    lo90, hi90 = _combine_quantiles(pred, model_names, 90)
    lo95, hi95 = _combine_quantiles(pred, model_names, 95)

    out = {
        "q50_base": median,
        "q10_base": lo80,  # aproximamos q10 con lo-80
        "q90_base": hi80,  # aproximamos q90 con hi-80
        "q05_base": lo95,
        "q95_base": hi95,
        "residuals": residuals,
    }
    return out
