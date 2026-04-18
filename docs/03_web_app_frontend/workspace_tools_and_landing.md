# Web workspace — tools, image flow, file analyst, and landing pages

This document is the **maintenance reference** for the operator dashboard in:

- **Frontend:** `tunde_webapp_frontend/` (Vite + React)
- **Backend:** `tunde_webapp_backend/` (FastAPI, separate app from `src/tunde_agent/main.py`)

HTTP base defaults to **`http://localhost:8001`** (override with `VITE_BACKEND_HTTP_BASE`). The backend entrypoint is `tunde_webapp_backend.app.main:app` (see `py app/main.py` from `tunde_webapp_backend/`).

**Branding:** Operator-facing UI and prompts use the **Tunde** identity. Do not surface third-party provider names in labels, hints, or user-visible tool copy.

---

## 1. Architecture (request flow)

1. The UI submits **`POST /tasks/submit`** with a JSON `payload` (`user_message`, `enabled_tools`, optional `image_generation`, `file_context`, `file_analyst_action`, etc.).
2. **`TaskOrchestrator`** runs tool phases (research, data, file context, image), then the LLM, then QC simulation.
3. Progress returns over **`WebSocket`** (`/ws/tunde`) as `tool_activity` and `task_status_change` (may include `blocks`: tables, images, errors).

Canonical backend behavior: [task_execution_model.md](../02_web_app_backend/task_execution_model.md), [websocket_transport.md](../02_web_app_backend/websocket_transport.md), [current_implementation.md](../02_web_app_backend/current_implementation.md) (web dashboard section).

---

## 2. Tools menu (`enabled_tools`)

Persisted in the browser as `sessionStorage` key `tunde_enabled_tools`.

| Key | UI label | Role |
| --- | -------- | ---- |
| `search` | Search | Web research (Tavily / Serper, etc.) |
| `analysis` | Analyze | Tabular analysis when the user **pastes** CSV/TSV-like text in the message |
| `file_analyst` | File Analyst | File **upload** + wizard; see §4 |
| `vision` | Generate Image | Image tool + chat wizard; see §3 |
| `memory` | (settings-driven) | Stub / settings |

Payload shape:

```json
"enabled_tools": {
  "search": true,
  "analysis": false,
  "vision": false,
  "memory": false,
  "file_analyst": false
}
```

---

## 3. Generate Image (Tunde imaging)

### 3.1 Operator workflow

1. User enables **Generate Image** in the **+** tools menu.
2. Chat shows a **style** step (10 options) then an **aspect ratio** step (6 options).
3. User types the image description in the composer and sends. **No image API call** runs until that send.
4. Optional payload field **`image_generation`** is attached only when the wizard is in `awaiting_prompt` and both style and ratio are set.

### 3.2 Style and ratio IDs (frontend)

Defined in `tunde_webapp_frontend/src/constants/imageGenerationWorkflow.js`:

- **Styles:** `realistic_photo`, `digital_illustration`, `cinematic_scene`, `surreal_fantasy`, `anime_manga`, `comic_book` (reserved for future text-to-comic pipeline), `watercolor`, `pencil_sketch`, `abstract_art`, `ui_ux_prototype`
- **Aspect ratios:** `1_1`, `16_9`, `9_16`, `4_3`, `3_4`, `21_9` plus human-readable labels and a canonical `aspect_ratio` string (e.g. `9:16`)

### 3.3 Backend prompt assembly

- Module: `tunde_webapp_backend/app/tools/image_tool.py` — **`build_infographic_prompt`**
- **`style_id == "realistic_photo"`:** Uses a **photographic** template (hero prefix/suffix, no default “infographic/dashboard” opener). Enforces **no text / infographics / charts** in copy.
- **Other styles:** Default “infographic / visual summary” framing; wizard parameters (including `style_id`, `aspect_ratio_id`, `target_aspect_ratio`) are embedded so the model respects them.
- **`comic_book`:** Extra instruction block for comic-style output and future panel tooling.

Execution: `generate_workspace_image` → configured image model (env in main agent settings).

### 3.4 Branding cleanup (UI)

- Tool hints and composer footers must **not** name external providers.
- Canvas chrome uses neutral **“image”** wording (`CanvasImage.jsx`, tool activity strings in `tools/manager.py`).

---

## 4. File & Data Analyst

### 4.1 Operator workflow

1. Enable **File Analyst** in the **+** menu. A **📄** upload control appears beside **+** (only active when the tool is on).
2. **`POST /files/upload`** (`multipart/form-data`: `file`, `user_id`) validates and ingests the file.
3. Chat shows **📂 File received**, a short **data summary** (rows/columns for tables, character counts for PDF/text), and a **`file_preview`** block (name, size, type).
4. **Data Wizard** buttons: Summarize, Analyze, Insights, Visualize — they submit messages with **`file_analyst_action`** and **`file_context: { file_id }`**.
5. Turning **File Analyst** off, switching chat, or clearing chat **drops** the active file context client-side. Re-upload if the server TTL expired.

### 4.2 Allowed types and validation

Implemented in `tunde_webapp_backend/app/tools/file_analyst_tool.py`:

- **Extensions:** `.csv`, `.xlsx`, `.pdf`, `.txt`
- **Max size:** `TUNDE_MAX_UPLOAD_BYTES` (default **8 MiB**)
- **CSV / XLSX:** `pandas` (+ `openpyxl` for `.xlsx`); sample rows exported as CSV text for the data-analysis tool
- **PDF:** `pdfplumber`, first **15** pages scanned for text
- **TXT:** UTF-8 with replacement for invalid bytes

### 4.3 Storage and TTL

- Module: `tunde_webapp_backend/app/tools/file_store.py`
- Files are written under `TUNDE_UPLOAD_DIR` or the system temp directory, subdirectory `tunde_webapp_uploads`, keyed by UUID.
- Registry entries expire after **`TUNDE_FILE_TTL_SEC`** (default **3600** seconds). **`get_registered_file(file_id, user_id)`** enforces **user_id** match.

### 4.4 Orchestration hooks

- `tools/manager.py`: If **`file_context`** is present and **`file_analyst`** is enabled, loads metadata, prepends **tool context** for the LLM, and for tabular files **forces** `data_analysis` and supplies CSV text even when **Analyze** (paste) is off.

---

## 5. Landing pages & sharing

### 5.1 Product behavior

- **Preview in Canvas:** Operators build a **report-style landing page** from recent chat context (messages, tool log, file analyst summary). The trigger is **not** in the main composer or the Data Wizard. It appears only as an animated **Preview in Canvas** chip under a **completed** assistant (CEO) turn when that run used **web research**, **paste/tabular data analysis**, and/or **file analyst** (`file_context` / `file_analyst` tool activity, excluding file-not-found errors). The chip is omitted if the message has no text and no blocks (empty context guard).
- **Canvas panel:** Opens **immediately** with a **“Tunde is building your page…”** skeleton while **`POST /api/pages/generate`** runs. After the response returns, HTML is **revealed progressively** (requestAnimationFrame chunks) so the **Code** tab and **Preview** iframe update in a live-feeling way. **Refine** sends a revision request; the same reveal animation runs on success.
- **Share:** **Share page** calls **`POST /api/pages/publish`** with the final HTML and copies the returned URL.

Frontend wiring: `runToolsRef` in `App.jsx` listens to `tool_activity` (`web_research`, `data_analysis`, `file_analyst`) and sets `canvasFollowUp` on the stored CEO message when the task completes.

### 5.2 Output format (important for maintainers)

**Published and previewed documents are static HTML5** with **Tailwind via CDN**, optional **Google Fonts (Inter / Roboto)**, and **Lucide** (icons). That keeps **`GET /share/{id}`** self-contained for any browser. The LLM is instructed for **premium Tunde dark** layouts: glassmorphism, strong hero typography, synthesized sections (not raw context dumps), optional table or CSS-only bars, footer.

Implementation: `tunde_webapp_backend/app/landing_page_generator.py`, `pages_router.py`.

### 5.3 API

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/api/pages/generate` | Body: `context`, optional `title_hint`, optional `existing_html` + `revision_notes` → `{ html, title }` |
| `POST` | `/api/pages/publish` | Body: `user_id`, `title`, `html` → `{ page_id, share_path, share_url }` |
| `GET` | `/share/{page_id}` | Public **read-only** HTML for UUID `page_id` (reads `html_document` inside the DB session so the ORM row is not expired) |

### 5.4 Environment

- **`TUNDE_PUBLIC_SHARE_BASE`** — Public origin for share links (no trailing slash), e.g. `https://tunde.ai`. If unset, `share_url` uses the **request host** (fine for local dev).
- **`TUNDE_MAX_PUBLISH_HTML_BYTES`** — Cap on stored HTML size (default ~2.5 MB).

### 5.5 Persistence

- Model: `PublishedPage` in `tunde_webapp_backend/app/models/published_page.py` — table **`published_pages`** (`page_id`, `user_id`, `title`, `html_document`, `created_at`).
- Created via SQLAlchemy **`create_all`** in `init_db()` (webapp DB, often SQLite `tunde_dev.db` via `TUNDE_DATABASE_URL`).

---

## 6. Key source files (quick map)

| Area | Path |
| ---- | ---- |
| Image prompt + generation | `tunde_webapp_backend/app/tools/image_tool.py`, `manager.py` |
| File ingest + store | `tunde_webapp_backend/app/tools/file_analyst_tool.py`, `file_store.py`, `file_router.py` |
| Landing generate + publish | `tunde_webapp_backend/app/landing_page_generator.py`, `pages_router.py`, `models/published_page.py` |
| Wizard constants | `tunde_webapp_frontend/src/constants/imageGenerationWorkflow.js` |
| Chat UI | `tunde_webapp_frontend/src/components/ChatCenter.jsx`, `ImageGenerationWizard.jsx`, `DataAnalystWizard.jsx`, `LandingCanvasPanel.jsx` |
| App state / API calls | `tunde_webapp_frontend/src/App.jsx` |

---

## 7. Documentation discipline

Any change to the workflows above should update **this file** and the [dashboard_spec.md](./dashboard_spec.md) “implemented” subsection. README should keep a short pointer to this doc for onboarding.
