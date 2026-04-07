"""
Append-only audit log for search API failures and provider rotation.

Writes to ``<project_root>/logs/api_errors.txt`` and mirrors lines to the terminal.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from tunde_agent.config.settings import project_root

logger = logging.getLogger("tunde_agent.search_api")

_LOG_PATH = project_root() / "logs" / "api_errors.txt"


def log_search_api_event(*, provider: str, error_type: str, action: str) -> None:
    """
    Record a search-backend event (failure, rate limit, rotation).

    * ``provider``: human-readable backend name (e.g. ``Google CSE``, ``Serper``).
    * ``error_type``: HTTP code, exception name, or short reason.
    * ``action``: what the agent did next (e.g. ``Switched to Serper``).
    """
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"{ts}\t{provider}\t{error_type}\t{action}"
    _LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        with _LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError as exc:
        logger.warning("Could not append to %s: %s", _LOG_PATH, exc)

    logger.info("[search-api] %s", line)
    if os.environ.get("TUNDE_SEARCH_API_SILENT_STDOUT", "").strip().lower() not in (
        "1",
        "true",
        "yes",
    ):
        print(f"[search-api] {line}", flush=True)
