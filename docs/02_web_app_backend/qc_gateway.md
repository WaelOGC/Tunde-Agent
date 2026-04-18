# QC gateway (backend enforcement point) — Phase 1.4

This document describes the **Quality Control (QC) Gatekeeper** that intercepts candidate results before they are allowed to “complete”.

Scope: **Phase 1.4 only** — QC logic is **mock rules**, not AI prompt auditing yet.

---

## 1. Purpose

- Ensure the “CEO” output is not finalized until QC explicitly approves.
- Provide a **bounded revision loop** to prevent infinite retries.
- Emit real-time **QC rejection** events so the UI can show clear operator feedback.

---

## 2. QC service interface

Implemented in `tunde_webapp_backend/app/qc_service.py`:

- `QCService.review(task, attempt) -> QCResult`
  - `QCResult.approved: bool`
  - `QCResult.feedback: str` (human-readable reason)

Current mock rule:

- If the task payload contains `{"force_reject": true}`, QC rejects.
- Otherwise QC approves.

---

## 3. Enforcement + decision loop

Implemented in `tunde_webapp_backend/app/orchestrator.py`:

1. Task produces a **candidate result** (mock).
2. Orchestrator transitions to `qc_review`.
3. QC decides:
   - **approved = true** → task transitions to `complete`
   - **approved = false** → task transitions to `needs_revision`
4. Retry until max attempts reached.

### Loop boundary

- `max_attempts = 3`
- If QC rejects 3 times → task transitions to `failed`

---

## 4. Real-time events

### a) Standard lifecycle broadcast

Every status change broadcasts:

`event = "task_status_change"` with payload:
- `task_id`
- `correlation_id`
- `status`
- `message`

### b) QC rejection broadcast

On every QC rejection, broadcast:

```json
{
  "event": "qc_rejection",
  "payload": {
    "task_id": "...",
    "correlation_id": "...",
    "reason": "...",
    "attempt": 1
  },
  "timestamp": "..."
}
```

---

## 5. What is intentionally NOT included yet

- No AI-based QC prompts or domain checklists yet.
- No persistence (DB tables) for QC reviews yet.
- No frontend UI yet (server-side only).

