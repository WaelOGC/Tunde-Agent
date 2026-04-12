# Current implementation (repository snapshot)

This document describes **what exists in the codebase today**, so it stays aligned with the running app. Visionary product text (SPA, full email automation, multi-tenant scale) remains in [architecture.md](./architecture.md), [features.md](./features.md), [roadmap.md](./roadmap.md), and [infrastructure.md](./infrastructure.md); treat those as **target direction** where they go beyond this file.

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

**Not in this repository:** a React (or other) SPA, IMAP read path, vector/blob stores as wired services. Those appear in architecture/features docs as planned or optional.

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
5. **Delivery** — Default report HTML (`report_html.build_landing_page_html`) written to disk; Telegram teaser via **`UIUXAgent`** / `telegram_markdown_v2` (structured HTML, optional ASCII chart from metrics). Link from **`TUNDE_PUBLIC_BASE_URL`** / **`REPORT_PUBLIC_BASE_URL`**. **Post-task** callbacks in `telegram_post_task_handlers.py` include **🎨 Landing page** (`l:`) → two-step **custom** HTML via `generation_service.py` (overwrites the same `uuid.html`). Other actions: PDF, DOCX, CSV, HTML export, email, Q&A, compare, summarize.
6. **SMTP (optional)** — “Send to email” uses **`SMTP_*`** and **`REPORT_EMAIL_TO`** / **`TUNDE_REPORT_EMAIL_TO`** when configured (`report_email.py`).

Mission audit stages are logged to **`audit_logs`** with `action_type` such as `mission_research` (JSON `details`).

---

## 4. Telegram behavior (summary)

- **Startup** — If `TELEGRAM_TOKEN` is empty, the poller does not start (logged critically). Otherwise a **daemon thread** runs `telegram_poller`.
- **Approvals** — `resolve_approval_from_telegram` (PostgreSQL **SECURITY DEFINER** function, migration `002`) updates `approval_requests` when the user taps inline buttons.
- **Private chat** — **`/start`** opens a **pillar menu** (inline `u:` callbacks); navigation **edits the same message** (`telegram_ux_menus`, `TelegramService.edit_message_html_in_chat`). Free text still works for casual chat; legacy **`/research`** / natural triggers remain in `telegram_chat_handler`. Topic capture after a menu pick uses **`telegram_ux_pending`**. **Photo edits:** incoming **`photo`** or image **`document`** (caption or two-step text) → `getFile` download → `generate_image_from_reference_bytes` (`gemini_image_generation.py`); pending `file_id` in **`telegram_pending_photo_edit`**; **`/cancel_photo_edit`**. **Video:** `u:v:10|20|30` sets **`telegram_pending_video_generation`**; next text → **`gemini_veo_video.generate_video_mp4_for_preset`** (Veo `predictLongRunning` + poll + download); **`TelegramService.send_video_to_chat`**; **`/cancel_video`**. **`/help`** is a short pointer, not a long command list.
- **Post-report** — Inline keyboard (`telegram_post_task_markup`) includes **📥 Export to PDF** (same handler as **📄 PDF**), landing, Word, CSV, etc. Pending **email** / **custom landing** prompts attach **Cancel** buttons (`u:ce`, `u:cl:{report_uuid}`). **`/cancel_landing`** / **`/cancel_email`** still work as hidden escapes.

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

Image includes **`docs/`** so `read_persona_document()` can load [persona_and_character.md](./persona_and_character.md) at runtime.

---

## 7. Testing notes

- **`pytest`** defaults exclude tests marked **`integration`** (PostgreSQL with migrations). See `pyproject.toml` `[tool.pytest.ini_options]`.

---

## 8. Document map

| Topic | Canonical doc |
| ----- | --------------- |
| Persona copy | [persona_and_character.md](./persona_and_character.md) |
| Approval philosophy | [human_approval_gate.md](./human_approval_gate.md) |
| CAPTCHA / browse policy | [captcha_handling_policy.md](./captcha_handling_policy.md) |
| RLS / encryption principles | [data_retrieval_protocol.md](./data_retrieval_protocol.md) |
| Legal / privacy / Docker intent | [security_and_legal_compliance.md](./security_and_legal_compliance.md) |
| Self-modification limits | [self_improvement_rules.md](./self_improvement_rules.md) |
| Research report language & search `hl:gl` locales | [research_language_and_search_locales.md](./research_language_and_search_locales.md) |

When **this file** and a vision doc disagree on **facts about the repo**, prefer **this file** and update the vision doc’s phasing or “planned” wording as needed.
