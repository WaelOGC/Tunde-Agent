# Tunde Agent — Project context

**Purpose:** Single source of truth for AI assistants and engineers joining new sessions.  
**Maintenance:** Update this file whenever architecture, endpoints, schema, major features, or priorities change.  
**Last reviewed:** 2026-04-22 — **Tunde Avatar (V1)** ⚠️ in progress: React module under `tunde_webapp_frontend/src/avatar/` (`AvatarMini`, `AvatarCore`, `AvatarExpanded`, `AvatarStateManager`; placeholder files for config/renderer/voice sync). `ChatCenter.jsx` tracks LISTENING / THINKING / SPEAKING from submit + `processing`; `AvatarMini` in the message list uses a stable IDLE state while frontend chat streaming stays off (`App.jsx`). **Docs:** `docs/avatar/*` specs + `avatar_visual_reference_v1.png`. **Shared LLM:** `src/tunde_agent/services/llm_service.py` — Gemini REST + DeepSeek + streaming iterators for orchestrator use. **Orchestrator:** `tunde_webapp_backend/app/orchestrator.py` — WebSocket `assistant_delta` / `assistant_done` when LLM streaming works; richer dashboard reply rules (no boilerplate intro, structured Markdown, light emojis, no Telegram/off-app CTAs). **`useTundeSocket.js`** — process-wide refcounted singleton WebSocket per URL (avoids stacked connections on refresh/remount).

**Earlier (2026-04-21):** **Design Agent** Phase 1 (Brand Identity) ✅; Phase 2 (Web Page Designer) ✅; Phase 3 (UI/UX Prototype) ⚠️ partial (Preview deferred); dashboard redesign (Tool Picker Modal, sidebar chat + Hub only); provider names hidden in UI.

**Earlier (2026-04-20):** Design Agent docs; bug fixes — (1) tool replies only patch the active session (`patchSessionMessages` + `activeSessionIdRef` in `App.jsx`); (2) Business Agent UI copy uses **Business Agent** across ChatCenter, App, Business canvases/modals, and export helpers (`TundeHub.jsx` unchanged — product name). Business slice, Document Writer markdown, removed `main.py` OAuth debug print — see §7.

---

## 1. Project overview

### Name

**Tunde Agent**

### Vision and purpose

Multi-domain AI workspace: tutoring, research, data analysis, coding help, translations, specialized domain agents (science, chemistry, space, health), and rich Canvas outputs (HTML pages, charts, 3D views). Goal is one coherent product with persistent conversations, hub integrations, and a scalable agent/tool architecture.

### Target users

- **Individuals** — daily questions, learning, productivity.
- **Students** — study assistant, math/science/chemistry help, research.
- **Businesses / teams** — future Business Agent and integrations (roadmap).

### Commercial model

Subscription tiers (planned): **Free**, **Pro**, **Business**, **Enterprise** — exact limits and pricing evolve with product maturity.

### Current development phase

**Active development:** Core tool endpoints and dashboard UX are largely implemented; **Tunde Hub** OAuth is partially complete. **Business Agent** has a **first implementation slice** (research + scenario simulation + accounting CSV upload, persistence, Canvas-oriented UI) present in the working tree — **commit and verify before treating as shipped**. **Design Agent** is documented and tracked as **in development** (Phase 1 brand identity — see `docs/08_tools/design_agent.md`, `design_agent_spec.md`). **Creative Writer** and deeper Hub integrations remain early or not started. Treat the product as **pre-release** unless stated otherwise.

---

## 2. Tech stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | React 19, Vite 7, Tailwind CSS 3, **Chart.js** + **react-chartjs-2**, **three** (Three.js for 3D / solar system / molecule views) |
| **Backend** | FastAPI, Python 3.x, SQLAlchemy 2 |
| **Database** | **SQLite** default for local dev (`tunde_webapp_backend/tunde_dev.db`). **PostgreSQL** for production/Docker (`docker-compose.yml`; DB exposed on host port **5433** by default via `POSTGRES_PUBLISH_PORT`). Override with `TUNDE_DATABASE_URL` / `TONDA_DATABASE_URL`. |
| **AI providers** | **Gemini** (primary for many flows, especially HTML/visual generation), **DeepSeek** (fallback / structured JSON-style tools — see orchestrator and individual tools). Configured via env (e.g. `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `DEFAULT_LLM_PROVIDER`). |
| **Ports** | **Frontend:** Vite dev server **5173**. **Web backend (local dev):** **8001** (`TUNDE_WEBAPP_PORT`). **Docker Compose** maps the bundled app service to **8000** — not the same as the standalone `uvicorn` dev command on 8001. |

---

## 3. Project structure

### Main folders (repository root)

| Folder | Purpose |
| --- | --- |
| `tunde_webapp_frontend/` | React + Vite dashboard: chat, workspace, Canvas, charts, 3D viewers, sidebar history. |
| `tunde_webapp_backend/` | FastAPI app: `/tools/*`, `/db/*`, `/auth/*`, `/tasks/*`, WebSockets, file upload, published pages. SQLite DB file lives here in dev. |
| `docs/` | Product and technical documentation (`MASTER_INDEX.md`, numbered sections, `08_tools/*`, database design, roadmap). **`docs/avatar/`** — Tunde Avatar V1 specs + visual reference. **This file:** `docs/PROJECT_CONTEXT.md`. |
| `docker/` | `Dockerfile` for containerized backend / services. |
| `docker-compose.yml` | PostgreSQL + app service wiring for containerized deployments. |
| `telegram_agent_core/` | Telegram-side agent core (parallel to web app in broader monorepo). |
| `integrations/` | Integration-related code/assets. |
| `alembic/` | Database migrations (when used). |
| `scripts/` | Utility scripts. |
| `tests/` | Backend/tests. |
| `data/` | Runtime data (e.g. Docker volume target). |
| `shared_assets/` | Shared static assets. |
| `downloads/` | Download/cache staging (if used). |
| `logs/` | Log output. |
| `src/tunde_agent/` | Shared Python package used by the web backend for LLM calls, settings, and web research (`search_tool`: Tavily → Serper). Not “legacy-only,” but **not** the FastAPI app root — imports go through `tunde_webapp_backend`. |

### Key files (quick reference)

**Backend**

- `tunde_webapp_backend/app/main.py` — FastAPI app, CORS, router wiring, `init_db`, `/health`.
- `tunde_webapp_backend/app/task_router.py` — **`/tasks/submit`** and all **`/tools/*`** POST routes.
- `tunde_webapp_backend/app/business_router.py` — **`POST /tools/business/research`**, **`/simulate`**, **`/accounting/upload`**.
- `tunde_webapp_backend/app/db_router.py` — **`/db/conversations`**, **`/db/messages`**, **`/db/tool-results`**, **`/db/canvas-pages`**, **`/db/business-research`**.
- `tunde_webapp_backend/app/auth_router.py` — **`/auth/status`**, Google/GitHub OAuth start/callback.
- `tunde_webapp_backend/app/db.py` — Engine, `database_url()`, `init_db()`.
- `tunde_webapp_backend/app/models/*.py` — SQLAlchemy models (schema source of truth).
- `tunde_webapp_backend/app/tools/*.py` — Tool implementations (math, science, chemistry, …).

**Frontend**

- `tunde_webapp_frontend/src/App.jsx` — Main shell: routing to tools, DB user id (`DEV_DB_USER`), Canvas, conversation persistence.
- `tunde_webapp_frontend/src/components/` — UI pieces (e.g. `ChatCenter.jsx`, `WorkspaceSidebar.jsx`, `DataChart.jsx`).
- `tunde_webapp_frontend/src/avatar/` — Tunde Avatar V1 UI scaffold (`AvatarMini.jsx`, `AvatarCore.jsx`, etc.).
- `tunde_webapp_frontend/package.json` — Scripts and dependencies.
- `src/tunde_agent/services/llm_service.py` — Shared LLM service (Gemini + DeepSeek, streaming) consumed by the web backend orchestrator.

**Docs**

- `docs/MASTER_INDEX.md` — Documentation map.
- `docs/08_tools/overview.md` — Tools overview.

---

## 4. Completed features

### Tools (working)

| Capability | HTTP |
| --- | --- |
| Math Solver | `POST /tools/math` |
| Science Agent | `POST /tools/science` |
| Chemistry Agent + 3D molecule / hologram-style view | `POST /tools/chemistry` |
| Space Agent + solar system 3D | `POST /tools/space` |
| Health Agent + SVG anatomy | `POST /tools/health` |
| Code Assistant + syntax highlighting | `POST /tools/code` |
| Translation Agent | `POST /tools/translation` |
| Research Agent + Canvas | `POST /tools/research` |
| Study Assistant | `POST /tools/study` |
| Data Analyst Phase 1+2 + Canvas | `POST /tools/data-analysis`, `POST /tools/data-follow-up` |
| Business Agent (slice) | `POST /tools/business/research`, `POST /tools/business/simulate`, `POST /tools/business/accounting/upload` — **see section 7** for repo/consistency notes |
| Document Writer | `POST /tools/document` — **✅ Done** (sections, scroll, dedupe, title dedup, GFM tables — 2026-04-20; see §7) |

### Infrastructure (working or in progress)

- **Tunde Hub:** Google OAuth **working**; GitHub OAuth **in progress / not fully done** (verify `auth_router` and env before claiming “done”).
- **Canvas:** Research canvas, Data canvas, Landing canvas; caching to avoid redundant API calls; saved Canvas card with **Open** action.
- **Database:** SQLite in dev; all core tables created via `init_db()`.
- **Conversation history:** Persistent; survives refresh.
- **Sidebar:** Conversation groups (**Today**, **Yesterday**, **Last 7 days**).
- **Tunde Avatar (V1 UI):** Mini animated orb component in chat; state machine and expanded overlay stub; full voice pipeline not wired yet.

---

## 5. Tools status table

| Tool | Status | Endpoint | Notes |
| --- | :---: | --- | --- |
| Math Solver | Done | `POST /tools/math` | |
| Science Agent | Done | `POST /tools/science` | |
| Chemistry Agent | Done | `POST /tools/chemistry` | 3D hologram-style molecule |
| Space Agent | Done | `POST /tools/space` | Solar system 3D |
| Health Agent | Done | `POST /tools/health` | SVG anatomy |
| Code Assistant | Done | `POST /tools/code` | Syntax highlighting |
| Translation | Done | `POST /tools/translation` | 50+ languages (per product docs) |
| Research Agent | Done | `POST /tools/research` | Canvas + web-style / infographic outputs |
| Study Assistant | Done | `POST /tools/study` | |
| Data Analyst | Phase 1+2 | `POST /tools/data-analysis`, `POST /tools/data-follow-up` | Charts, trends, Canvas |
| Document Writer | Done | `POST /tools/document` | Sections/tabs, scroll, dedupe, title strip, pipe tables (`ChatCenter.jsx`, `document_writer.py`) — 2026-04-20 |
| Business Agent | Partial | See §4 | First slice: research, simulate, accounting upload, DB list/get |
| Design Agent — Brand Identity | ✅ Done | `POST /tools/design/brand-identity` | Gemini SVG + JSON; `DesignAgentCanvas` |
| Web Page Designer | ✅ Done | `POST /tools/web-page/generate` | Plain CSS HTML; Preview Coming Soon |
| UI/UX Prototype | ⚠️ Partial | `POST /tools/uiux/generate` | Coming Soon in picker; Preview deferred |
| Architecture Visualizer | ⚠️ Partial | `POST /tools/architecture/generate` | Sustainability + Materials + Assessment live. 3D View Coming Soon. fal.ai integrated. |
| Creative Writer | Next | — | Not started |

---

## 6. Database schema (`tunde_dev.db` in dev)

Tables are defined in `tunde_webapp_backend/app/models/` and created with `Base.metadata.create_all`.

| Table | Purpose / main columns |
| --- | --- |
| **conversations** | `conv_id` (PK), `user_id`, `title`, `tool_used`, `started_at`, `ended_at` |
| **messages** | `message_id` (PK), `conv_id` (FK), `role`, `content`, `blocks_json`, `tool_type`, `timestamp` |
| **tool_results** | `result_id` (PK), `conv_id`, `message_id`, `tool_type`, `input_data`, `result_json`, `created_at` |
| **canvas_pages** | `canvas_id` (PK), `conv_id`, `message_id`, `kind`, `title`, `html_content`, `tool_type`, `created_at`, `updated_at` |
| **published_pages** | `page_id` (PK), `user_id`, `title`, `html_document`, `created_at` — public share via `GET /share/{page_id}` |
| **user_integrations** | `integration_id`, `user_id`, `provider`, `encrypted_access_token`, `encrypted_refresh_token`, `token_expires_at`, `created_at`, `updated_at` — OAuth tokens for hub (encrypted at app layer) |
| **agents** | `agent_id`, `domain`, `version`, `is_active`, `capabilities` (JSON text), `created_at` — agent registry |
| **task_executions** | `task_id`, `correlation_id`, `agent_id`, `status`, `final_result`, `created_at` |
| **task_status_events** | `event_id`, `task_id`, `correlation_id`, `status`, `message`, `created_at` |
| **qc_audit_logs** | `audit_id`, `task_id`, `attempt_number`, `approved`, `feedback`, `timestamp` |
| **business_research** | `research_id`, `user_id`, `session_id`, `niche_query`, `payload_json`, `accounting_snapshot_json`, `created_at`, `updated_at` — Business Agent snapshots |

---

## 7. Current issues — not yet fixed

### ✅ Fixed (2026-04-20)

| Issue | Root cause | Fix |
| --- | --- | --- |
| Tool responses appearing in **all** sessions | `patchSessionMessages` in `App.jsx` updated every session | Added **`activeSessionIdRef.current`** guard alongside the existing `sessionId` check so patches apply only when the session is active. |
| **Business Agent** showed as **Tunde Agent** | Wrong user-facing labels (e.g. `enabledTools` in `ChatCenter.jsx`) | Updated strings in **`ChatCenter.jsx`**, **`App.jsx`**, **`BusinessAnalysisCanvas.jsx`**, **`BusinessSimulateModal.jsx`**, **`businessReportHtml.js`**, and **`canvasExportCore.js`** to say **Business Agent**. **`TundeHub.jsx`** still says **Tunde Agent** (product name), not the tool. |
| `&&` vs `\|\|` operator bug in `patchSessionMessages` | Using `\|\|` meant patches only applied when session ID matched **both** `activeSessionIdRef.current` **and** `sessionId` simultaneously — causing dropped patches on fast session switches. | Changed to `&&` so a session is skipped only when it matches **neither** condition. Located in `App.jsx` ~line 810. Fixed: 2026-04-20. |
| Document Writer — missing section tabs | Heading split regex only matched `#`–`###`, so `####`–`######` blocks stayed merged | **`DOCUMENT_SECTION_SPLIT`** in **`ChatCenter.jsx`** — split on all ATX levels (`#`–`######`). |
| Document Writer — content truncated at top | Nested scroll / scroll anchoring left the inner document panel scrolled down | **`docBodyScrollRef`**, **`useLayoutEffect`** (`scrollTop = 0`), **`overflowAnchor: none`**, section scroll uses container-relative positioning — **`ChatCenter.jsx`**. |
| Document Writer — duplicate section tab | Consecutive chunks with the same heading + duplicate nav labels | **`mergeAdjacentDuplicateHeadingParts`**, **`stripLeadingAtxLine`**, consecutive-label **nav filter** — **`ChatCenter.jsx`**. |
| Document Writer — raw `#` heading in body | First content line repeated **`block.title`** as ATX heading | **`stripLeadingDuplicateDocTitle`** + **`bodyForDoc`** for render/copy — **`ChatCenter.jsx`**. |
| Document Writer — tables | Model often used bullets for tabular data; pipe tables needed parsing + styling | **`document_writer.py`** — prompt instructs GFM pipe tables; **`DocumentWriterMarkdownTable`**, **`segmentDocumentWriterMarkdown`** — **`ChatCenter.jsx`**. |

### ✅ Fixed (2026-04-22)

| Issue | Root cause | Fix |
| --- | --- | --- |
| **Bug 3 — Refresh duplicate chat + user messages disappear** | Churn in logs (**`DELETE /db/conversations`**, then **`POST /db/conversations`**) had no separate “cleanup” function in the tree—**`App.jsx`** is the only caller of conversation **DELETE** (`handleDeleteChat` → sidebar). Races during **bootstrap** (e.g. **React Strict Mode** / effect order) could let **delete** or **new**-chat paths run before the list and active session were stable. **POST** also created a **new** row whenever the UI stayed on a **`local_*`** draft but **`tunde_last_active_conv_id`** still pointed at an existing conv. | **`App.jsx`**: boot sync read + **`dbConvId`** in **`localStorage`**, **`bootHydrationDoneRef`** (delete only after boot **`finally`**), **`POST /db/conversations`** with optional **`conv_id`** for local drafts (backend get-or-create, no duplicate row on resume), message mapping; **`ChatCenter.jsx`**: **`role.trim()`** + user bubble text fallback. |
| **Multiple WebSocket connections on load** | Each hook/effect run could create a new socket while another was still **CONNECTING** / timers stacked reconnects across remounts. | **`useTundeSocket.js`**: module-level **single socket per URL** with **refcount**; reconnect only while refcount \> 0; one shared handler pipeline. |

### Code / operations (tracked in docs)

| Severity | Issue | Location / notes |
| --- | --- | --- |
| ~~High~~ (fixed 2026-04-20) | Startup printed `GOOGLE_CLIENT_ID` to stdout | Was in `tunde_webapp_backend/app/main.py` — removed; rotate key if logs were shared. |
| Med | Business Agent files **not all committed** while `main.py` may include `business_router` | Ensure `business_router.py`, `tools/business_agent.py`, `models/business_research.py`, and frontend Business components are committed together, or backend import fails / CI breaks. |
| Med | Live web research needs API keys | `search_tool`: `TAVILY_API_KEY` preferred, else `SERPER_API_KEY` via `tunde_agent` settings — without keys, research enrichment degrades gracefully. |

### Document Writer (frontend/display)

Shipped fixes are listed in **✅ Fixed (2026-04-20)** above. Optional spot-check: text contrast on light panels in edge-case themes.

---

## 8. Next steps (priority order)

1. Tunde Avatar — wire `AvatarCore` into main shell if desired; implement `AvatarVoiceSync` / STT-TTS; optionally tie `AvatarMini` in the transcript to live `avatarState` when chat streaming is re-enabled client-side.
2. Architecture Visualizer 3D View — resolve Three.js rendering in React iframe (deferred to pre-release).
3. Add `glb_url` to `architecture_projects` DB table.
4. Resolve UI/UX Prototype Preview (iframe CSP issue with Vite dev server — deferred to pre-release).
5. Update `PROJECT_MAP.md` with new files: `design_agent.py`, `design_router.py`, `brand_identity.py`, `web_page_designer.py`, `web_page_router.py`, `web_page_design.py`, `uiux_prototype.py` (tool), `uiux_router.py`, `uiux_prototype.py` (model), `DesignAgentCanvas.jsx`, `BrandIdentityWizard.jsx`, `WebPageDesignerCanvas.jsx`, `WebPageDesignerWizard.jsx`, `UIUXCanvas.jsx`, `UIUXWizard.jsx`, `ToolPickerModal.jsx`, `designAgentWorkflow.js`, `webPageDesignerWorkflow.js`, `uiuxWorkflow.js`.
6. Build **Creative Writer**.
7. Data Analyst **Phase 3** (Google Drive, Gmail).
8. **Voice Engine** (extends Avatar work).
9. **Official marketing website.**
10. **Project Folders** feature (DB + UI).

---

## 9. Important decisions

- **SQLite** for local dev; **PostgreSQL** in Docker/production — align `TUNDE_DATABASE_URL` with deployment.
- **Dev user ID:** `"dev_user"` until full auth is wired everywhere (`App.jsx` `DEV_DB_USER`, backend `auth_router` dev fallback).
- **Feature completeness bar:** New features should include **documentation**, **backend**, **database** (when applicable), and **frontend** together; keep docs in sync.
- **Canvas:** Cache client-side / avoid redundant API calls for Canvas payloads.
- **Owner preference (Wael):** **Docs first**, then backend + DB + frontend in tandem.
- **AI usage pattern:** Gemini emphasized for HTML/rich generation; DeepSeek used for structured tool JSON and orchestration policies where configured.
- **Provider labels (2026-04-21):** AI provider names (`gemini`, `deepseek`, `fallback`, etc.) must **never** be shown to users in any UI element. Provider info is stored in the DB but hidden from all frontend displays.
- **Tool Picker (2026-04-21):** Tools are accessed via a **modal** (+ button in the composer) instead of sidebar tool buttons. The sidebar contains **chat history + Tunde Hub** only.
- **Design Agent family (2026-04-21):** Sub-tools (**Brand Identity**, **Web Page Designer**, **UI/UX Prototype**) appear as **separate cards** in the Tool Picker under the **Design** category tab.
- **Assistant streaming (2026-04-22):** The web backend orchestrator may stream model output over **`/ws/tunde`** as **`assistant_delta`** then **`assistant_done`** when `LLMService.chat_stream` succeeds; the UI may still assemble the final assistant message via non-streaming paths for stability—events remain available for future live typing and avatar sync.

---

## 10. How to run

### Backend (local dev, port 8001)

```bash
cd tunde_webapp_backend
py -m uvicorn tunde_webapp_backend.app.main:app --reload --port 8001
```

(Alternative: `cd` into `tunde_webapp_backend` and run `py app/main.py` — uses `TUNDE_WEBAPP_PORT`, default 8001.)

### Frontend (Vite, port 5173)

```bash
cd tunde_webapp_frontend
npm run dev
```

### Reset SQLite database (schema changes)

From `tunde_webapp_backend`, delete the dev DB and restart the backend:

**PowerShell (Windows)**

```powershell
cd tunde_webapp_backend
Remove-Item -Force .\tunde_dev.db
```

**cmd.exe**

```bat
cd tunde_webapp_backend
del tunde_dev.db
```

Then restart uvicorn so `init_db()` recreates tables.

### Docker note

`docker-compose up` runs PostgreSQL and the app container; web app port in compose is **8000** — set `TUNDE_DATABASE_URL` / `TONDA_DATABASE_URL` to the Postgres DSN when not using SQLite.

---

## Related documentation

- [Documentation index](./MASTER_INDEX.md)
- [Database schema overview](./05_database_design/schema_overview.md) *(and `docs/03_database_design/schema_overview.md` if duplicated)*
- [Tools overview](./08_tools/overview.md)
