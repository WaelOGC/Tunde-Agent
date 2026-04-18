# Restructuring logs — Telegram bot core extraction

This log documents the **why** and **how** of extracting the Telegram bot into `telegram_agent_core/` and reorganizing documentation into a numbered hierarchy.

---

## Why we did this

- **Isolation of concerns**: Telegram UX + polling + callbacks are a product surface of their own. Keeping them separate reduces coupling with FastAPI services that are not Telegram-specific.
- **Safer refactors**: A dedicated package boundary makes it easier to evolve the “no-command” nested-menu UX without accidentally impacting unrelated backend modules.
- **Clear ownership**: Future contributors can quickly find Telegram behavior (menus, callbacks, post-report actions, pending state) in one place.
- **Scalable documentation**: The new `docs/0x_*` layout prevents the docs root from turning into an unmaintainable flat folder.

---

## What changed (high level)

### 1) Code moved into `telegram_agent_core/`

- Created `telegram_agent_core/` with `services/` as the Telegram-bot package.
- Moved Telegram bot files (poller, chat handler, UX menus, post-task handlers, pending state, Telegram API client) out of `src/tunde_agent/services/` into `telegram_agent_core/services/`.
- Updated all internal imports to the new module paths so the bot stays functional.
- Added a centralized callback router (`CallbackQueryHandler`) so **all button interactions** flow through a single dispatcher.

### 2) Packaging updated

- Updated `pyproject.toml` so `telegram_agent_core` is included as an installable package alongside `src/`.

### 3) Documentation reorganized

- Moved existing markdown files into:
  - `docs/01_telegram_bot/`
  - `docs/02_web_app_backend/`
  - `docs/03_web_app_frontend/`
  - `docs/04_database_schema/`
  - `docs/05_project_roadmap/`
- Added `docs/MASTER_INDEX.md` to link everything.
- Updated cross-links inside docs to match the new paths.

---

## How to extend this structure

- **Telegram feature work**: update `docs/01_telegram_bot/` (UX flows, callback schemas, media standards).
- **Backend/API work**: update `docs/02_web_app_backend/` (routes, services, security).
- **Database work**: update `docs/04_database_schema/`.
- **Roadmap/product governance**: update `docs/05_project_roadmap/`.

Rule: every task must produce a doc update/addition in the relevant folder.

