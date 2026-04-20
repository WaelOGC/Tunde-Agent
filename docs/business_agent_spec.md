# Business Agent — Architecture & Maintenance Spec

This document describes the **Business Agent** stack added to the Tunde web app: persistence, HTTP APIs, core logic (10 capabilities), and frontend canvas integration.

## Overview

- **Task type (orchestration):** `TaskType.BUSINESS_AGENT` in `tunde_webapp_backend/app/task_models.py` identifies the tool for future conveyor / orchestrator wiring.
- **Runtime path:** Chat UI calls `POST /tools/business/research` with `{ query, user_id?, session_id?, include_live_search? }`. Results are stored in SQLite/Postgres via SQLAlchemy model `BusinessResearch` and surfaced as a `business_solution` message block + **Business Analysis Canvas** (`BusinessAnalysisCanvas.jsx`).
- **Design:** Dark glassmorphism aligned with Tunde UI; financial tables use `CanvasTable` with `highlightMetrics={true}`; assistant text uses extended metric/acronym highlighting in `AssistantFormattedText.jsx` / `CanvasTable.jsx`.

## Database

**Table:** `business_research` (`tunde_webapp_backend/app/models/business_research.py`)

| Column | Purpose |
|--------|---------|
| `research_id` | UUID primary key |
| `user_id` | Tenant/user string (indexed) |
| `session_id` | UUID for idempotent follow-up / resume (indexed, nullable in API but always set on insert) |
| `niche_query` | Original query text |
| `payload_json` | Full JSON snapshot of the last structured analysis |
| `accounting_snapshot_json` | Optional JSON from invoice/accounting uploads |
| `created_at` / `updated_at` | Timestamps |

**ORM bootstrap:** `init_db()` imports `BusinessResearch` so `create_all` builds the table.

**Read API:** `GET /db/business-research?user_id=…&session_id=…` and `GET /db/business-research/{research_id}` in `db_router.py`.

## HTTP API

Router: `tunde_webapp_backend/app/business_router.py` (included from `main.py`).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tools/business/research` | Full structured pack: market, competitors, radar, sentiment, SWOT, scenario P/L stub, market cap band, accounting stub, outlook, `canvas_html`. Persists to `business_research`. |
| `POST` | `/tools/business/simulate` | Deterministic what-if P/L from `BusinessScenarioSimulateRequest` (no LLM). |
| `POST` | `/tools/business/accounting/upload` | `multipart/form-data`: `user_id`, `file` — parses CSV/TSV/lines, returns quarterly tax **illustrations** and stores an accounting snapshot row. |

**Errors:** `400` validation / parse failures; `503` LLM failures (`LLMError`); `500` unexpected server errors. Search failures are **non-fatal**: the agent continues with `search_status` of `unavailable` / `partial` and model knowledge.

## Ten capability areas (logic flow)

All are produced in one LLM JSON pass (`tools/business_agent.py`, `BUSINESS_JSON_SYSTEM`) except **scenario simulation** (dedicated endpoint) and **accounting upload** (parser).

1. **Market analysis** — `market_analysis`: niche label, trends[], market size notes, opportunities[], risks[]. Uses live web notes when `include_live_search` is true (Tavily → Serper via `search_tool.py`).
2. **Competitor analysis** — `competitor_analysis.players[]` with strengths/weaknesses/notes.
3. **Competitor radar** — `competitor_radar.points[]` with `x`,`y` in 0–100 for Canvas scatter; axes labels in `competitor_radar.axes`.
4. **Review sentiment** — `review_sentiment`: summary, gaps[], polarity.
5. **Interactive SWOT** — `swot` quadrants as parallel arrays; rendered as a 4-column `CanvasTable` with `highlightMetrics` in the canvas.
6. **Scenario simulation** — `scenario_simulation` in full research is LLM-filled; **numeric** what-if uses `run_scenario_simulation()` on `/tools/business/simulate` (compound step growth, COGS/OpEx ratios, tax on positive EBIT).
7. **Market cap analysis** — `market_cap`: `niche_value_band`, `methodology`, `drivers[]` (ranges, not audited filings).
8. **Smart accounting** — `smart_accounting` stub in LLM output; **upload** path uses `parse_accounting_upload()` for line/CSV parsing and illustrative quarterly allocation (not tax advice).
9. **Canvas integration** — `canvas_html` optional fragment; **BusinessAnalysisCanvas** also renders structured tabs (Overview, SWOT, Competitors, Radar, Financials, Outlook, Web page iframe).
10. **Future outlook** — `future_outlook.milestones[]` with `year`, `title`, `detail` for a 5-year narrative.

**Fallback:** If JSON parsing fails, `_default_response()` still returns a valid contract so the UI never breaks.

## Frontend

### Chat UX (`ChatCenter.jsx`)

- **User turn:** When Business Agent submits, the user row includes a `business_brief` block (see `parseBusinessBrief` in `src/utils/businessBrief.js`). The UI renders a **Business Brief Card** (glass, read-only grid: Niche, Market, Budget, Geography, Timeline, Goal, Notes + optional “Original message” disclosure) instead of a raw wall of text.
- **Assistant turn:** `business_solution` is rendered as **BusinessSolutionBlock** (Document Writer–style shell: dark `#0d0f14` header, meta badges, executive summary inside a blurred glass inner panel). Summary copy uses **`AssistantFormattedText` with `highlightTokens`** so EBITDA, TAM, YoY, ROI, etc. pick up metric styling.
- **Persistent Canvas access:** Every completed pack shows **Open Business Analysis** (re-hydrates from the message’s `business_solution` block or `businessBlockCacheRef` in `App.jsx` — no extra `/tools/business/research` call). When the Canvas is already linked to that message, a slim **“Canvas is open”** banner with **Focus panel** appears.
- **Business toolkit (chat row):** Buttons dispatch `onBusinessAction({ action, messageId })` to `App.jsx`:
  - `radar` → Canvas tab **Competitor Radar**
  - `simulate` → opens **`BusinessSimulateModal`**; on success merges `/tools/business/simulate` into `scenario_simulation` and focuses Canvas **Financials**
  - `swot` → tab **SWOT**
  - `tax` → tab **Financials** (Smart accounting / quarterly stub lives there; anchor id `tunde-business-tax-report`)
  - `web_page` → calls existing **`POST /api/pages/generate`** with `source: "business_agent"` and structured context; writes returned HTML into `canvas_html`, then selects tab **Web page**

### App state (`App.jsx`)

- `businessTabRequest`: `{ id, tab }` — incrementing `id` forces **BusinessAnalysisCanvas** to apply deep-linked tabs without remounting the panel.
- `businessBlockCacheRef`: messageId → last known block snapshot for resilient reopen after layout changes.
- `handleBusinessAction` routes toolkit + Open button events; `openBusinessPack(messageId, tab)` sets `canvasView`, `canvasLinkedMessageId`, `canvasBusinessBlock`, and `landingOpen`.

### Canvas (`BusinessAnalysisCanvas.jsx`)

- Receives `tabRequest` from App; `useEffect` watches `tabRequest.id` / `tabRequest.tab` and calls `setTab` when the set of allowed tab ids matches (`overview` | `swot` | `competitors` | `radar` | `financials` | `outlook` | `page`).

### Highlighting

- **`AssistantFormattedText.jsx`** / **`CanvasTable.jsx`:** shared token regex includes currencies, quarters, and business acronyms (**including ROI**). `AssistantRichText` still auto-enables `highlightMetrics` on markdown pipe tables whose headers look financial.

## Maintenance notes

- Prompt changes: edit `BUSINESS_JSON_SYSTEM` only with valid JSON shape; keep keys stable for the React canvas.
- New metrics in UI highlights: update the shared regex in **both** `AssistantFormattedText.jsx` and `CanvasTable.jsx`.
- DB migrations: project uses `create_all` for dev; for production Postgres migrations, add an Alembic revision mirroring `BusinessResearch`.
