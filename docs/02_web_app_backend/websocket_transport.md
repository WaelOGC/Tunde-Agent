# WebSocket transport (server-side) — Phase 1.2

This document specifies the initial server-side WebSocket transport for the Tunde web app.

---

## Endpoint

- **Path**: `GET /ws/tunde` (WebSocket upgrade)
- **Purpose**: real-time bidirectional channel for live progress updates and operator-visible events.

---

## Standard JSON message format (envelope)

All server → client messages use this format:

```json
{
  "event": "status_update",
  "payload": { "any": "json" },
  "timestamp": "2026-04-17T10:00:00+00:00"
}
```

- **event**: short string describing the message kind (e.g. `welcome`, `status_update`, `pong`)
- **payload**: JSON object carrying event-specific data
- **timestamp**: UTC ISO-8601 timestamp

Client → server messages are also expected to be JSON objects. For Phase 1.2, the supported event is `ping`.

---

## Connection behavior (Phase 1.2)

1. On connect, the server immediately sends:
   - `event = "welcome"`
2. Client can send:
   - `{"event":"ping","payload":{...}}`
3. Server responds:
   - `event = "pong"` with `payload.echo = <payload>`

Unknown events receive:

- `event = "ack"` with `payload.received_event`

---

## Implementation notes

- Connection management lives in `tunde_webapp_backend/app/ws_manager.py`:
  - connect / disconnect
  - broadcast (for Phase 1.3+ progress events)
- WebSocket endpoint lives in `tunde_webapp_backend/app/ws_router.py`.

