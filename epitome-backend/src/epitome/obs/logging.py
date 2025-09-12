from __future__ import annotations
import os, sys, json, time
from loguru import logger

def setup_logging():
    logger.remove()

    # Nivel (INFO por defecto)
    level = os.getenv("EPITOME_LOG_LEVEL", "INFO").upper()

    # Formato JSON por stdout (apto para Render)
    def _formatter(record):
        payload = {
            "ts": record["time"].isoformat(),
            "level": record["level"].name,
            "msg": record["message"],
            "file": f"{record['file'].name}:{record['line']}",
            "module": record["module"],
            "func": record["function"],
            "extra": record["extra"],
        }
        return json.dumps(payload) + "\n"

    logger.add(sys.stdout, level=level, backtrace=False, diagnose=False, format=_formatter)
    logger.info("Logging configurado", extra={"component": "logging"})
    return logger
