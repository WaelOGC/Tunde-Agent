# Current implementation (repository snapshot)

This document describes **what exists in the codebase today**, so it stays aligned with the running app. Visionary product text (SPA, full email automation, multi-tenant scale) remains in [architecture.md](./architecture.md), [features.md](./features.md), [../05_project_roadmap/roadmap.md](../05_project_roadmap/roadmap.md), and [infrastructure.md](./infrastructure.md); treat those as **target direction** where they go beyond this file.

**Configuration reference:** project root [`.env.example`](../.env.example) (copy to `.env`). **Operator runbook:** [README.md](../README.md).

---

## 1. Runtime stack

| Layer | Technology |
| ----- | ---------- |
| HTTP API | **FastAPI** (`tunde_agent.main:app`), **Uvicorn** |
| Database | **PostgreSQL** (primary); SQLAlchemy 2.x; **Alembic** migrations |
| Browser automation | **Playwright** (+ optional stealth-oriented deps per `pyproject.toml`); Chromium installed in the Docker image |
| LLM | **Gemini** and **DeepSeek** via **httpx** REST; **task routing** in `tunde_agent/multi_agent/model_router.py` (`TaskKind`, `resolve_llm_client`) — JSON-heavy steps prefer DeepSeek when configured ([multi_agent.md](./multi_agent.md)) |
| Human approvals & UX | **Telegram Bot API** (long-polling thread at startup when `TELEGRAM_TOKEN` is set) |
| Report artifacts | Self-contained **HTML** files under `data/reports/` (path resolved at runtime; Docker bind-mount `./data:/app/data`) |

**Also in this repository:** the **web dashboard** React SPA under `tunde_webapp_frontend/` (see §7). **Not in this repository:** IMAP read path, vector/blob stores as wired services. Those appear in architecture/features docs as planned or optional.

---

## 2. HTTP API surface

| Method | Path | Role |
| ------ | ---- | ---- |
| `GET` | `/health` | Liveness; **does not** check the database |
| `GET` | `/health/db-rls-smoke` | Inserts one `audit_logs` row under RLS using the seeded smoke user (`SMOKE_TEST_USER_ID` in code constants) |
| `POST` | `/chat` | Stateless LLM turn (`DEFAULT_LLM_PROVIDER`: `gemini` or `deepseek`). Audit row stores **metadata only** (provider label + event type), not the user message body |
| `GET` | `/test-browse` | Playwright smoke: query `url`, optional `user_id`, optional `headed=1` for visible browser |
| `POST` | `/mission/start` | **202 Accepted**: queues a **research mission** on a background task (topic, optional priority `url`, optional `output_language` `en`/`ar`, optional `user_id`) |
| `GET` | `/reports/view/{report_id}` | Serves saved HTML report by UUID (validates UUID, returns 404 if file missing) |

Routers: `api/mission.py` (prefix `/mission`), `api/report.py` (reports route at app root).

---

## 3. Research mission flow (end-to-end)

1. **Start** — `POST /mission/start` validates the optional URL against browse policy, ensures DB principal exists, enqueues `execute_research_mission` on a worker thread.
2. **URL discovery** — `discover_source_urls` may use **programmatic search APIs** in fixed order (**Google Programmable Search → Serper → Riley-style POST API**), then browser/SERP fallbacks as implemented in `services/search_api/` and browser tools. Optional env: **`TUNDE_RESEARCH_OUTPUT_LANG`**, **`TUNDE_RESEARCH_SEARCH_LOCALES`**. Operator-oriented explanation: [research_language_and_search_locales.md](./research_language_and_search_locales.md).
3. **First page + gate** — Opens the first source, captures evidence for **Telegram**; **`request_human_approval`** creates an `approval_requests` row, sends photo or text with inline buttons to **`MY_TELEGRAM_CHAT_ID`**, polls until approved/denied/timeout.
4. **Post-approval orchestration** — `run_post_approval_pipeline`: parallel page fetch; **master plan** (task overlaps fetch); **vision** on collected pages; **extractor** (structured JSON, once); revision loop: **analyst** → **designer LLM** (Chart.js + QuickChart PNG when valid) → **verifier** → **master quality gate** (bounded revisions).
5. **Delivery** — Default report HTML (`report_html.build_landing_page_html`) written to disk; Telegram teaser via **`UIUXAgent`** and `telegram_agent_core/services/telegram_markdown_v2.py` (structured HTML, optional ASCII chart from metrics). Link from **`TUNDE_PUBLIC_BASE_URL`** / **`REPORT_PUBLIC_BASE_URL`**. **Post-task** callbacks in `telegram_agent_core/services/telegram_post_task_handlers.py` include **🎨 Landing page** (`l:`) → two-step **custom** HTML via `generation_service.py` (overwrites the same `uuid.html`). Other actions: PDF, DOCX, CSV, HTML export, email, Q&A, compare, summarize.
6. **SMTP (optional)** — “Send to email” uses **`SMTP_*`** and **`REPORT_EMAIL_TO`** / **`TUNDE_REPORT_EMAIL_TO`** when configured (`report_email.py`).

Mission audit stages are logged to **`audit_logs`** with `action_type` such as `mission_research` (JSON `details`).

---

## 4. Telegram behavior (summary)

- **Startup** — If `TELEGRAM_TOKEN` is empty, the poller does not start (logged critically). Otherwise a **daemon thread** runs `telegram_agent_core/services/telegram_poller.py`.
- **Approvals** — `resolve_approval_from_telegram` (PostgreSQL **SECURITY DEFINER** function, migration `002`) updates `approval_requests` when the user taps inline buttons.
- **Private chat** — **`/start`** opens a **pillar menu** (inline `u:` callbacks); navigation **edits the same message** (`telegram_agent_core/services/telegram_ux_menus.py`, `TelegramService.edit_message_html_in_chat`). Free text still works for casual chat. Topic capture after a menu pick uses **`telegram_agent_core/services/telegram_ux_pending.py`**. **Photo edits:** incoming **`photo`** or image **`document`** (caption or two-step text) → `getFile` download → `generate_image_from_reference_bytes` (`tunde_agent/services/gemini_image_generation.py`); pending `file_id` in **`telegram_agent_core/services/telegram_pending_photo_edit.py`**. **Video:** `u:v:10|20|30` sets **`telegram_agent_core/services/telegram_pending_video_generation.py`**; next text → **`tunde_agent/services/gemini_veo_video.py`** (`generate_video_mp4_for_preset`); then `TelegramService.send_video_to_chat`. **`/help`** shows the main menu.
- **Post-report** — Inline keyboard (`telegram_agent_core/services/telegram_post_task_markup.py`) includes **📥 Export to PDF** (same handler as **📄 PDF**), landing, Word, CSV, etc. Pending **email** / **custom landing** prompts attach **Cancel** buttons (`u:ce`, `u:cl:{report_uuid}`).

---

## 5. Data model (migrated tables)

Alembic revisions **`001_rls`** / **`002_approval`** (see `alembic/versions/`):

| Table | Purpose |
| ----- | ------- |
| `users` | Principals; seeded smoke user for dev |
| `sessions` | Session tokens (scaffold for future web auth) |
| `audit_logs` | Append-style events (`user_id`, `action_type`, `details`) |
| `encrypted_data` | Per-user encrypted key/value rows (`ENCRYPTION_KEY` in settings) |
| `approval_requests` | Human gate: `pending` / `approved` / `denied`, JSON `payload`, RLS |

Application DB role **`tunde_app`** is non-superuser with **RLS FORCE** on tenant-scoped tables; API **`DATABASE_URL`** must use `tunde_app`. **`ALEMBIC_DATABASE_URL`** uses the owner role for migrations.

---

## 6. Docker Compose (developer)

- **`db`**: `postgres:15`, published host port **`POSTGRES_PUBLISH_PORT`** (default **5433**).
- **`app`**: builds `docker/Dockerfile`, **`alembic upgrade head`** then **`uvicorn`**, port **8000**, **`./data` → `/app/data`**, `env_file: .env` plus explicit `DATABASE_URL` / `ALEMBIC_DATABASE_URL` pointing at `db`.

Image includes **`docs/`** so `read_persona_document()` can load [persona_and_character.md](../01_telegram_bot/persona_and_character.md) at runtime.

---

## 7. Web dashboard subsystem (`tunde_webapp_backend` / `tunde_webapp_frontend`)

A separate **operator workspace** ships in the same repository:

| Piece | Role |
| ----- | ---- |
| `tunde_webapp_backend/` | FastAPI app (`tunde_webapp_backend.app.main:app`): health, **`POST /tasks/submit`**, **`/ws/tunde`**, **`POST /files/upload`**, **`POST /api/pages/generate`**, **`POST /api/pages/publish`**, **`GET /share/{page_id}`** |
| `tunde_webapp_frontend/` | Vite + React UI: chat, tools menu, image wizard, file analyst + Data Wizard, landing Canvas (preview/code/share) |

Default dev ports: backend **`TUNDE_WEBAPP_PORT`** (often **8001**), frontend Vite **5173**. CORS allows local SPA origins.

**Database:** `TUNDE_DATABASE_URL` / `TONDA_DATABASE_URL` default to SQLite `sqlite:///./tunde_dev.db` for this app; SQLAlchemy **`create_all`** seeds tables including conversations, task logs, **`published_pages`**, etc. This is **independent** of the primary mission API’s PostgreSQL URL unless you point both at the same engine.

**Tools (summary):** Web research; pasted-tabular analysis; **file analyst** (upload CSV/XLSX/PDF/TXT with TTL storage); **image generation** with wizard (`image_generation` payload, style/ratio IDs, realistic-photo prompt branch); **landing pages** (HTML + Tailwind CDN for public share).

**Full operator + env reference:** [../03_web_app_frontend/workspace_tools_and_landing.md](../03_web_app_frontend/workspace_tools_and_landing.md).

---

## 8. Testing notes

- **`pytest`** defaults exclude tests marked **`integration`** (PostgreSQL with migrations). See `pyproject.toml` `[tool.pytest.ini_options]`.

---

## 9. Document map

| Topic | Canonical doc |
| ----- | --------------- |
| Persona copy | [persona_and_character.md](../01_telegram_bot/persona_and_character.md) |
| Approval philosophy | [human_approval_gate.md](../01_telegram_bot/human_approval_gate.md) |
| CAPTCHA / browse policy | [captcha_handling_policy.md](./captcha_handling_policy.md) |
| RLS / encryption principles | [data_retrieval_protocol.md](../04_database_schema/data_retrieval_protocol.md) |
| Legal / privacy / Docker intent | [security_and_legal_compliance.md](./security_and_legal_compliance.md) |
| Self-modification limits | [self_improvement_rules.md](../05_project_roadmap/self_improvement_rules.md) |
| Research report language & search `hl:gl` locales | [research_language_and_search_locales.md](./research_language_and_search_locales.md) |
| Web workspace tools, file TTL, landing share URLs | [../03_web_app_frontend/workspace_tools_and_landing.md](../03_web_app_frontend/workspace_tools_and_landing.md) |

When **this file** and a vision doc disagree on **facts about the repo**, prefer **this file** and update the vision doc’s phasing or “planned” wording as needed.
