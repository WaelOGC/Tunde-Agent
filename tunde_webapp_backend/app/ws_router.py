"""
WebSocket transport endpoint(s) for Tunde.

Phase 1.2 scope:
- `/ws/tunde` accepts connections
- sends a `welcome` event on connect
- supports `ping` → `pong` for connectivity tests
- provides `broadcast` for future progress updates
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from tunde_webapp_backend.app.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/tunde")
async def ws_tunde(ws: WebSocket) -> None:
    await ws_manager.connect(ws)
    await ws_manager.send(ws, event="welcome", payload={"message": "Connected to Tunde."})

    try:
        while True:
            msg: Any = await ws.receive_json()
            if not isinstance(msg, dict):
                await ws_manager.send(ws, event="error", payload={"message": "Message must be JSON object."})
                continue

            event = str(msg.get("event") or "").strip().lower()
            payload = msg.get("payload")
            if payload is None:
                payload = {}
            if not isinstance(payload, dict):
                payload = {"value": payload}

            if event == "ping":
                await ws_manager.send(ws, event="pong", payload={"echo": payload})
                continue

            # Unknown event for now: acknowledge without failing.
            await ws_manager.send(ws, event="ack", payload={"received_event": event})
    except WebSocketDisconnect:
        await ws_manager.disconnect(ws)
    except Exception:
        logger.exception("ws/tunde handler error")
        await ws_manager.disconnect(ws)

