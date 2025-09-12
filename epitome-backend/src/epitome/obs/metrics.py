from __future__ import annotations
from prometheus_client import Counter, Histogram

# HTTP genérico
HTTP_REQUESTS = Counter(
    "epitome_http_requests_total",
    "Total de peticiones HTTP",
    ["method", "route", "status"]
)
HTTP_LATENCY = Histogram(
    "epitome_http_request_duration_seconds",
    "Latencia por ruta",
    ["method", "route"],
    buckets=[0.01,0.025,0.05,0.1,0.25,0.5,1,2,5,10]
)

# Métricas de dominio
FORECAST_LATENCY = Histogram(
    "epitome_forecast_seconds", "Latencia de /forecast", buckets=[0.05,0.1,0.25,0.5,1,2,5,10]
)
RISK_CALLS = Counter("epitome_risk_calls_total", "Llamadas a /risk")
REGIME_CALLS = Counter("epitome_regime_calls_total", "Llamadas a /regime")
SIGNALS_CALLS = Counter("epitome_signals_calls_total", "Llamadas a /signals")
SIGNALS_ACTION = Counter("epitome_signals_action_total", "Acciones emitidas", ["action"])
