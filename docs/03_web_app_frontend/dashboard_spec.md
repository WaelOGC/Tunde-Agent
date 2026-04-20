# Dashboard spec — Split Screen (Web App Frontend)

This spec defines the frontend dashboard UX direction for the forthcoming web app.

---

## 1. Concept: Split Screen layout

The dashboard is a **two-pane workspace** (conceptual target — see **Current layout** below):

- **Left pane (Operator I/O)**
  - Primary input: chat / task prompt composer
  - Attachments: drag-drop files, images, screenshots
  - Quick actions: “Run deep research”, “Generate image”, “Generate video”, “Build landing page”
  - Output feed: final answers, delivered artifacts, export links

- **Right pane (Real-time Agent Logic & Logs)** — *roadmap / optional column when we surface it in the UI*
  - Live step timeline: plan → tool calls → approvals → synthesis
  - Evidence panel: sources visited, citations, extracted snippets
  - Approval queue: pending sensitive actions (Proceed / Abort)
  - Debug view (operator-only): structured events, durations, error summaries (never show provider names or raw keys)

**Current layout:** The shipped React app uses a **workspace sidebar** plus a **single main column**. The **chat area (composer + messages) uses the full width** of that main column. There is **no visible process / pipeline strip** next to chat; orchestration (**Agent → QC → CEO**) runs **in the background only** and is **intentionally hidden** from the operator (see §6). When **Canvas** (landing/report) mode is open, a second column shows the generated HTML preview — not a live process stepper.

The goal is to keep the operator’s work **fast and transparent** in outcomes; a dedicated live “how it happened” pane remains a **product option**, not the default experience today.

---

## 2. Real-time behavior

- **Streaming**: as steps complete, the backend/emitted events still drive state (WebSocket); the UI does **not** mirror a step timeline in a side panel — progress is reflected via chat affordances (e.g., “Thinking” / tool lines) where implemented.
- **Non-blocking**: long tool runs should not freeze the UI; server-side orchestration continues **Agent → QC → CEO** without exposing that pipeline as a visible timeline.
- **Message cleanliness**: the main chat column shows outcomes and assistant content; detailed event history for reproducibility remains **server-side / logs** unless we add an optional operator view later.

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
- Every run should be reproducible from **correlation IDs, server logs, and stored artifacts** (inputs, sources, approvals, outputs). The dashboard does **not** currently expose a right-pane event history to end users.

---

## 6. Implemented today (`tunde_webapp_frontend` + `tunde_webapp_backend`)

The Vite/React workspace matches the **sidebar + full-width chat** layout: primary interaction is chat and tools in the **main column**, which spans the **full width** of the content area next to the workspace sidebar.

**Process / pipeline visibility**

- **`ProcessStepper` has been removed** from the dashboard UI (desktop and mobile). There is no “Process” drawer, floating button, or right-hand step timeline.
- The **Agent → QC → CEO** pipeline **continues to run in the background** over WebSocket and HTTP task submission; status updates are **not** shown as a dedicated panel.
- This is **intentional**: orchestration is **hidden from the user** by default so the surface stays focused on conversation and artifacts.
- When **Canvas** (landing/report) mode is open, a **Canvas** column appears beside chat on large screens and shows **Preview / Code** for generated HTML — this is **not** a replacement for the old process stepper; it is report preview only.

The **Canvas 🖼️** trigger remains contextual (Data Wizard and post–search/analysis replies), not in the main composer.

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

