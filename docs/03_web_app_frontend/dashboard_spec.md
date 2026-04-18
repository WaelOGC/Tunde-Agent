# Dashboard spec — Split Screen (Web App Frontend)

This spec defines the frontend dashboard UX direction for the forthcoming web app.

---

## 1. Concept: Split Screen layout

The dashboard is a **two-pane workspace**:

- **Left pane (Operator I/O)**
  - Primary input: chat / task prompt composer
  - Attachments: drag-drop files, images, screenshots
  - Quick actions: “Run deep research”, “Generate image”, “Generate video”, “Build landing page”
  - Output feed: final answers, delivered artifacts, export links

- **Right pane (Real-time Agent Logic & Logs)**
  - Live step timeline: plan → tool calls → approvals → synthesis
  - Evidence panel: sources visited, citations, extracted snippets
  - Approval queue: pending sensitive actions (Proceed / Abort)
  - Debug view (operator-only): structured events, durations, error summaries (never show provider names or raw keys)

The goal is to keep the operator’s work **fast and transparent**: you can see what the agent is doing *while* you continue writing or reviewing.

---

## 2. Real-time behavior

- **Streaming**: partial updates appear in the right pane as steps complete.
- **Non-blocking**: long tool runs should not freeze the UI; every step is represented as a discrete event.
- **Message cleanliness**: the left pane shows outcomes; the right pane contains the “how it happened”.

---

## 3. Approval flow (Web UI parity with Telegram)

Telegram already supports approvals via inline buttons. The Web UI should provide the same control surface:

- A “Pending approvals” list with:
  - action summary
  - affected account/resource
  - risk level / irreversibility note
  - Proceed / Abort
  - timestamp + timeout

---

## 4. Navigation & information architecture

- Tabs or sections aligned to the same pillars used in Telegram:
  - Business & Market Intelligence
  - Engineering & Technical Design
  - Creative Media Studio
  - Pro Video Generation
  - Web & Landing Solutions

These are **presentation groupings** only; the agent remains unified.

---

## 5. Non-negotiables

- No secrets in the UI (keys, tokens).
- No raw provider branding in operator-facing copy; the system should present a unified “Tunde” identity.
- Every run should be reproducible from the right-pane event history (inputs, sources, approvals, outputs).

---

## 6. Implemented today (`tunde_webapp_frontend` + `tunde_webapp_backend`)

The Vite/React workspace in the repo matches the **left-pane chat + tools** model above. The **right pane** currently emphasizes **process / QC status** (`ProcessStepper`); when **Canvas** report mode is open, a **Canvas** column replaces the stepper on large screens and shows **Preview / Code** for generated HTML. The **Canvas 🖼️** trigger is contextual (Data Wizard and post–search/analysis replies), not in the main composer.

**Canonical maintenance doc:** [workspace_tools_and_landing.md](./workspace_tools_and_landing.md).

| Capability | Status |
| ---------- | ------ |
| Chat + `POST /tasks/submit` + WebSocket progress | Implemented |
| Tools: Search, Analyze (pasted tables), File Analyst (upload), Generate Image | Implemented |
| Image wizard: 10 styles × 6 aspect ratios; `image_generation` payload | Implemented |
| File upload `POST /files/upload`; PDF/CSV/XLSX/TXT; TTL + user-scoped registry | Implemented |
| Data Wizard (file): summarize / analyze / insights / visualize | Implemented |
| Landing page: `POST /api/pages/generate`, Canvas preview, `POST /api/pages/publish`, `GET /share/{id}` | Implemented |
| Drag-drop attachments (generic) | Not yet (upload is tool-specific) |
| Full evidence / approval queue parity with Telegram | Partial / roadmap |

