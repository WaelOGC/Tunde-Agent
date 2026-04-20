# Database schema — conversations, messages, tool results, canvas (Phase 2.4)

This document describes the **SQLAlchemy-backed tables** used by the Tunde web dashboard for chat persistence, tool JSON, and generated Canvas HTML. It complements the broader blueprint in [../03_database_design/schema_overview.md](../03_database_design/schema_overview.md).

**Bootstrap:** `tunde_webapp_backend/app/db.py` (`init_db()` → `Base.metadata.create_all`).  
**HTTP API:** `tunde_webapp_backend/app/db_router.py` (prefix `/db`).

---

## 1. `conversations`

| Column | Type | Nullable | Notes |
| ------ | ---- | -------- | ----- |
| `conv_id` | UUID | PK | Default `uuid4` |
| `user_id` | String(128) | No | Indexed |
| `started_at` | DateTime (UTC) | No | Thread start |
| `title` | String(512) | Yes | Conversation title |
| `tool_used` | String(64) | Yes | e.g. math, science, research |
| `ended_at` | DateTime (UTC) | Yes | When the thread ended |

**Endpoints:**

- `POST /db/conversations` — create a row, or return an existing row when `conv_id` is supplied and already present.
- `GET /db/conversations?user_id=…` — list conversations for that user (newest `started_at` first). Response: `{ ok, conversations: [...] }`.

---

## 2. `messages`

| Column | Type | Nullable | Notes |
| ------ | ---- | -------- | ----- |
| `message_id` | UUID | PK | Default `uuid4` |
| `conv_id` | UUID | FK → `conversations.conv_id` CASCADE | Indexed |
| `role` | String(16) | No | e.g. `user`, `ceo` |
| `content` | Text | No | Plain text body |
| `timestamp` | DateTime (UTC) | No | Message time |
| `blocks_json` | Text | Yes | JSON blocks (tool results, structured UI) |
| `tool_type` | String(64) | Yes | math, science, chemistry, etc. |

**Endpoints:**

- `POST /db/messages` — insert one message (optional client `message_id`; 409 if duplicate).
- `GET /db/conversations/{conv_id}/messages` — list all messages for a conversation (oldest `timestamp` first). Response: `{ ok, conv_id, messages: [...] }` (each message includes `blocks_json` when stored).

---

## 3. `tool_results`

Permanent archive of every tool run (full JSON), keyed to conversation and ORM message.

| Column | Type | Nullable | Notes |
| ------ | ---- | -------- | ----- |
| `result_id` | UUID | PK | |
| `conv_id` | UUID | FK → `conversations` CASCADE | Indexed |
| `message_id` | UUID | FK → `messages` CASCADE | Indexed |
| `tool_type` | String(64) | No | math, science, chemistry, space, health, code, translation, research, study, data_analyst, … |
| `input_data` | Text | No | User/tool input (string; often JSON-serialized upstream) |
| `result_json` | Text | No | Full tool JSON response |
| `created_at` | DateTime (UTC) | No | |

**Endpoints:**

- `POST /db/tool-results` — append one row (`message_id` must belong to `conv_id`).
- `GET /db/tool-results/{conv_id}` — ordered list by `created_at` ascending.

---

## 4. `canvas_pages`

Stores generated Canvas documents (full HTML), linked to a conversation and a **frontend** message id (string, not necessarily the DB `messages.message_id` UUID).

| Column | Type | Nullable | Notes |
| ------ | ---- | -------- | ----- |
| `canvas_id` | UUID | PK | |
| `conv_id` | UUID | FK → `conversations` CASCADE | Indexed |
| `message_id` | String(256) | No | Client message id; indexed |
| `kind` | String(64) | No | e.g. `web_page`, `infographic`, `data_export`, `landing` |
| `title` | String(512) | No | |
| `html_content` | Text | No | Full generated HTML |
| `tool_type` | String(64) | No | Tool that produced the page |
| `created_at` | DateTime (UTC) | No | |
| `updated_at` | DateTime (UTC) | No | Bumped on refine / `PUT` |

**Endpoints:**

- `POST /db/canvas-pages` — create.
- `GET /db/canvas-pages/{message_id}` — returns the row with the latest `updated_at` if multiple exist.
- `PUT /db/canvas-pages/{canvas_id}` — partial update (`title`, `html_content`, `kind`, `tool_type`); always refreshes `updated_at`.

---

## 5. Migration notes

`create_all` **does not** alter existing SQLite files when new columns are added. For local dev, delete `tunde_dev.db` (or point `TUNDE_DATABASE_URL` at a fresh database) so tables are recreated. Production should move to **Alembic** revisions once the schema stabilizes.

---

## 6. Router registration

`db_router` is included from `tunde_webapp_backend/app/main.py` as:

```python
from tunde_webapp_backend.app.db_router import router as db_router
app.include_router(db_router)
```
