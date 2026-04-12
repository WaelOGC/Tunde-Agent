# Tunde Agent

Personal AI agent stack: **Python**, **FastAPI**, **Playwright**, **PostgreSQL**. Documentation lives in [`docs/`](docs/). Research missions: report language and search locales (`TUNDE_RESEARCH_*` in `.env`) are explained in [`docs/research_language_and_search_locales.md`](docs/research_language_and_search_locales.md).

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

## How to use (Telegram)

With the bot running and `TELEGRAM_TOKEN` set, open your bot in Telegram:

1. Send **`/start`** — you get a **short welcome** (no long command list) and a **pillar menu** (Business, Engineering, Creative, Video, Web, About).
2. Tap a pillar, then a track. The bot **edits the same message** as you navigate so the chat stays tidy.
3. When asked for a topic or image brief, **send your next message as plain text**.
4. **Photo edits:** send a **photo** with a **caption** describing the change (e.g. new background), *or* send the photo first, then a short text instruction. **Creative → 📷 Edit my photo** opens the same flow. Cancel a two-step edit with **`/cancel_photo_edit`**. Requires `GEMINI_API_KEY` and `GEMINI_IMAGE_MODEL`.
5. **Video (Veo):** **Pro Video Generation → 10 / 20 / 30** — tap a duration tier, then send your **scene description** as the next message. Renders are async (often minutes); the bot delivers an MP4. Cancel a waiting tier with **`/cancel_video`**. Set `GEMINI_VIDEO_MODEL` (see `.env.example`); optional `TUNDE_VEO_*` tuning in [docs/media_standards.md](docs/media_standards.md).
6. After a **deep research** report appears, use the **inline row on that message** for view, landing page, **📥 Export to PDF**, Word, CSV, email, and more. Cancels for email or custom landing use **buttons** on the instruction messages.

Details: [`docs/ux_framework.md`](docs/ux_framework.md) and [`docs/media_standards.md`](docs/media_standards.md).

## Project layout

See the scaffold under `src/tunde_agent/` (`api`, `config`, `db`, `models`, `domain`, `services`, `tools`) and [`docs/architecture.md`](docs/architecture.md). Multi-agent orchestration and Gemini vs DeepSeek routing: [`docs/multi_agent.md`](docs/multi_agent.md).
