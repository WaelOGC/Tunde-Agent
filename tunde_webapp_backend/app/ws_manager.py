"""
WebSocket connection management for `/ws/tunde`.

Phase 1.2: minimal connect/disconnect/broadcast, with a standard JSON envelope.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


def _utc_ts() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True, slots=True)
class WsEnvelope:
    event: str
    payload: dict[str, Any]
    timestamp: str

    @staticmethod
    def build(event: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "event": str(event),
            "payload": dict(payload or {}),
            "timestamp": _utc_ts(),
        }


class WsConnectionManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.info("ws connected")

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(ws)
        logger.info("ws disconnected")

    async def send(self, ws: WebSocket, *, event: str, payload: dict[str, Any] | None = None) -> None:
        await ws.send_json(WsEnvelope.build(event, payload))

    async def broadcast(self, *, event: str, payload: dict[str, Any] | None = None) -> int:
        """
        Send an event to all currently connected clients.
        Returns the number of attempted deliveries.
        """
        envelope = WsEnvelope.build(event, payload)
        async with self._lock:
            targets = list(self._connections)

        delivered = 0
        for ws in targets:
            try:
                await ws.send_json(envelope)
                delivered += 1
            except Exception as exc:
                logger.warning(
                    "ws broadcast failed event=%s err=%s; dropping client",
                    event,
                    str(exc)[:200],
                )
                await self.disconnect(ws)
        return delivered


# Single manager instance for the backend process.
ws_manager = WsConnectionManager()

