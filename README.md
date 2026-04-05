# Tunde Agent

Personal AI agent stack: **Python**, **FastAPI**, **Playwright**, **PostgreSQL**. Documentation lives in [`docs/`](docs/).

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

## Project layout

See the scaffold under `src/tunde_agent/` (`api`, `config`, `db`, `models`, `domain`, `services`, `tools`) and [`docs/architecture.md`](docs/architecture.md).
