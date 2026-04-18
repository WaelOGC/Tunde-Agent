# Task execution model (server-side orchestration) — Phase 1.3

This document describes the initial server-side **conveyor belt** that simulates a task moving through lifecycle states and broadcasting real-time updates to the UI.

Scope: **Phase 1.3 only** — no true AI agents yet, and **no QC logic** yet.

---

## 1. Task lifecycle (states)

`queued → running → qc_review → complete`

Additional states exist for shape compatibility with later phases:

- `needs_revision` (reserved for Phase 1.4+)
- `failed`

---

## 2. Task schema

Each task has:

- `task_id` (UUID)
- `correlation_id` (UUID) — included in **logs** and **WebSocket payloads** for traceability
- `status`
- `payload` (JSON object)
- `result` (JSON object, optional)

Implemented in: `tunde_webapp_backend/app/task_models.py`.

---

## 3. Real-time event broadcast

Every status transition broadcasts:

```json
{
  "event": "task_status_change",
  "payload": {
    "task_id": "...",
    "correlation_id": "...",
    "status": "running",
    "message": "Task is running."
  },
  "timestamp": "..."
}
```

Delivered via the shared WebSocket manager (`tunde_webapp_backend/app/ws_manager.py`).

---

## 4. Mock execution (simulation)

Because the agent army is not wired yet, the orchestrator uses `asyncio.sleep()` to simulate work at each stage.

- Implementation: `tunde_webapp_backend/app/orchestrator.py`
- Entry point: `POST /tasks/submit` with `{ "payload": {...} }`

The UI should listen on `ws://<host>/ws/tunde` to see task progress events.

