# Tunde Agent

Personal AI agent stack: **Python**, **FastAPI**, **Playwright**, **PostgreSQL**. Documentation lives in [`docs/`](docs/). Research missions: report language and search locales (`TUNDE_RESEARCH_*` in `.env`) are explained in [`docs/02_web_app_backend/research_language_and_search_locales.md`](docs/02_web_app_backend/research_language_and_search_locales.md).

## Quick start (Docker)

```bash
docker compose up --build
```

- **API:** http://localhost:8000  
- **Health:** http://localhost:8000/health  
- **Chat:** `POST http://localhost:8000/chat` with JSON `{"message":"..."}` — set `GEMINI_API_KEY` or `DEEPSEEK_API_KEY` and `DEFAULT_LLM_PROVIDER` (`gemini` or `deepseek`) in `.env` / Compose.  
- **Browser smoke:** `GET http://localhost:8000/test-browse?url=https://example.com` — Playwright + CAPTCHA policy (Chromium is installed in the Docker image). Use `headed=1` for a visible window while debugging.  
- **PostgreSQL (from your machine):** `localhost:5433` → container port 5432 (avoids conflict with a local Postgres on 5432). User/password/db: `tunde` / `tunde` / `tunde`. Set `POSTGRES_PUBLISH_PORT` in `.env` if 5433 is taken.

Copy [`.env.example`](.env.example) to `.env` for local non-Docker runs.

## How to use (Telegram — button-driven)

1. Open your bot in Telegram and press **Start**.
2. You will see a **Main Menu** with 5 pillars:
   - 🏢 Business & Market Intelligence
   - 🔬 Engineering & Technical Design
   - 🎨 Creative Media Studio
   - 🎬 Pro Video Generation
   - 🌐 Web & Landing Solutions
3. Tap a pillar → tap an option → Tunde will ask a clear **next prompt** (topic/brief/scene).
4. Navigation keeps the chat clean: menus **edit in place** as you move between screens.
5. After deep research reports are delivered, use the **buttons on the report message** (PDF export, landing page, email, summarize, compare, etc.).

Built for Visionaries by Wael Safan & NewFinity

**Database roles:** The API must connect as `tunde_app` (non-superuser) so **RLS** applies. Use `ALEMBIC_DATABASE_URL` with the `tunde` superuser when running **Alembic** (migrations). Docker Compose sets both automatically and runs `alembic upgrade head` before Uvicorn.

```bash
# From project root (Postgres reachable on localhost:5433 by default)
alembic upgrade head
```

## Local Python (without Docker for the app)

```bash
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -e ".[dev]"
uvicorn tunde_agent.main:app --reload
```

Ensure PostgreSQL is running and `DATABASE_URL` matches your instance.

## Web dashboard (operator workspace)

The repo includes a **Vite + React** UI (`tunde_webapp_frontend/`) and a **FastAPI** web backend (`tunde_webapp_backend/`) for chat, tools, and canvas-style outputs. This stack is **separate** from `uvicorn tunde_agent.main:app` (default port **8000**); the web backend defaults to **`TUNDE_WEBAPP_PORT=8001`**.

**Features:** Search / Analyze / **File Analyst** (upload CSV, XLSX, PDF, TXT with TTL storage), **Generate Image** (style & aspect wizard + `image_generation` payload), **Report landing pages** (contextual **Canvas 🖼️** → generate HTML + Tailwind, side preview, **`POST /api/pages/publish`**, public **`GET /share/{id}`**).

**Documentation:** [`docs/03_web_app_frontend/workspace_tools_and_landing.md`](docs/03_web_app_frontend/workspace_tools_and_landing.md) (workflows, env vars, file paths). Dashboard UX direction: [`docs/03_web_app_frontend/dashboard_spec.md`](docs/03_web_app_frontend/dashboard_spec.md).

Local dev (typical):

```bash
cd tunde_webapp_backend && py -m uvicorn tunde_webapp_backend.app.main:app --host 127.0.0.1 --port 8001 --reload
cd tunde_webapp_frontend && npm install && npm run dev
```

Set `VITE_BACKEND_HTTP_BASE` if the API is not on `http://localhost:8001`. For production-style share links, set **`TUNDE_PUBLIC_SHARE_BASE`** (e.g. `https://tunde.ai`) — see [`.env.example`](.env.example).

## Project layout

See the scaffold under `src/tunde_agent/` (`api`, `config`, `db`, `models`, `domain`, `services`, `tools`) and [`docs/02_web_app_backend/architecture.md`](docs/02_web_app_backend/architecture.md). Multi-agent orchestration and routing: [`docs/02_web_app_backend/multi_agent.md`](docs/02_web_app_backend/multi_agent.md). Web workspace details: [`docs/03_web_app_frontend/workspace_tools_and_landing.md`](docs/03_web_app_frontend/workspace_tools_and_landing.md).
