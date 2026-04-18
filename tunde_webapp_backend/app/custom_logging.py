"""
Structured logging setup for the Tunde web backend.

Goal: predictable, machine-parseable logs without adding third-party dependencies.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class LogContext:
    service: str = "tunde_webapp_backend"


class JsonFormatter(logging.Formatter):
    def __init__(self, *, ctx: LogContext) -> None:
        super().__init__()
        self._ctx = ctx

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "service": self._ctx.service,
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_structured_logging(*, level: str = "INFO", service: str = "tunde_webapp_backend") -> None:
    """
    Configure root logging to emit one-line JSON records to stdout.

    Keep this small and deterministic; richer correlation IDs are added later when the task lifecycle exists.
    """
    lvl = getattr(logging, (level or "INFO").strip().upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(lvl)

    # Clear existing handlers so uvicorn/dev reload doesn't double-log.
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setLevel(lvl)
    handler.setFormatter(JsonFormatter(ctx=LogContext(service=service)))
    root.addHandler(handler)

