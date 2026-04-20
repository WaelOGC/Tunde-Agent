# Tunde Agent — Project context

**Purpose:** Single source of truth for AI assistants and engineers joining new sessions.  
**Maintenance:** Update this file whenever architecture, endpoints, schema, major features, or priorities change.

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

**Active development:** Core tool endpoints and dashboard UX are largely implemented; **Tunde Hub** OAuth is partially complete; roadmap agents (Business, Design, Creative Writer) and deeper integrations are **not** started or are early. Treat the product as **pre-release** unless stated otherwise.

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
| `docs/` | Product and technical documentation (`MASTER_INDEX.md`, numbered sections, `08_tools/*`, database design, roadmap). **This file:** `docs/PROJECT_CONTEXT.md`. |
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
| `src/` | Legacy or auxiliary Python package layout (confirm before relying on imports). |

### Key files (quick reference)

**Backend**

- `tunde_webapp_backend/app/main.py` — FastAPI app, CORS, router wiring, `init_db`, `/health`.
- `tunde_webapp_backend/app/task_router.py` — **`/tasks/submit`** and all **`/tools/*`** POST routes.
- `tunde_webapp_backend/app/db_router.py` — **`/db/conversations`**, **`/db/messages`**, **`/db/tool-results`**, **`/db/canvas-pages`**.
- `tunde_webapp_backend/app/auth_router.py` — **`/auth/status`**, Google/GitHub OAuth start/callback.
- `tunde_webapp_backend/app/db.py` — Engine, `database_url()`, `init_db()`.
- `tunde_webapp_backend/app/models/*.py` — SQLAlchemy models (schema source of truth).
- `tunde_webapp_backend/app/tools/*.py` — Tool implementations (math, science, chemistry, …).

**Frontend**

- `tunde_webapp_frontend/src/App.jsx` — Main shell: routing to tools, DB user id (`DEV_DB_USER`), Canvas, conversation persistence.
- `tunde_webapp_frontend/src/components/` — UI pieces (e.g. `ChatCenter.jsx`, `WorkspaceSidebar.jsx`, `DataChart.jsx`).
- `tunde_webapp_frontend/package.json` — Scripts and dependencies.

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
| Document Writer | `POST /tools/document` — **known UI/display bugs** (see section 7) |

### Infrastructure (working or in progress)

- **Tunde Hub:** Google OAuth **working**; GitHub OAuth **in progress / not fully done** (verify `auth_router` and env before claiming “done”).
- **Canvas:** Research canvas, Data canvas, Landing canvas; caching to avoid redundant API calls; saved Canvas card with **Open** action.
- **Database:** SQLite in dev; all core tables created via `init_db()`.
- **Conversation history:** Persistent; survives refresh.
- **Sidebar:** Conversation groups (**Today**, **Yesterday**, **Last 7 days**).

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
| Document Writer | Bugs | `POST /tools/document` | Display issues (section 7) |
| Business Agent | Next | — | Not started |
| Design Agent | Next | — | Not started |
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

---

## 7. Current issues — not yet fixed

**Document Writer (frontend/display):**

- Text color contrast: light or low-contrast text on light background (readability).
- Markdown **tables** not rendered — pipe table syntax shows as raw text.
- Markdown **markers visible** — e.g. `**`, `*`, `#` appear instead of formatted bold/heading.

*Fix targets:* likely `AssistantFormattedText.jsx` / Document Writer panel styles and markdown pipeline in `App.jsx` or related components.

---

## 8. Next steps (priority order)

1. Fix Document Writer display issues (markdown + theme).
2. Build **Business Agent** (documentation + backend + frontend + database).
3. Build **Design Agent**.
4. Build **Creative Writer**.
5. Data Analyst **Phase 3** (e.g. Google Drive, Gmail — per roadmap).
6. **Voice Engine** (Phase 4).
7. **Official marketing website.**

---

## 9. Important decisions

- **SQLite** for local dev; **PostgreSQL** in Docker/production — align `TUNDE_DATABASE_URL` with deployment.
- **Dev user ID:** `"dev_user"` until full auth is wired everywhere (`App.jsx` `DEV_DB_USER`, backend `auth_router` dev fallback).
- **Feature completeness bar:** New features should include **documentation**, **backend**, **database** (when applicable), and **frontend** together; keep docs in sync.
- **Canvas:** Cache client-side / avoid redundant API calls for Canvas payloads.
- **Owner preference (Wael):** **Docs first**, then backend + DB + frontend in tandem.
- **AI usage pattern:** Gemini emphasized for HTML/rich generation; DeepSeek used for structured tool JSON and orchestration policies where configured.

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
