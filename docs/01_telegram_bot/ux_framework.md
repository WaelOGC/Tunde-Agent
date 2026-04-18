# Telegram UX framework (button-first)

Tunde’s operator-facing Telegram surface is **menu-first**: primary actions use **nested inline keyboards**; long command lists are **not** shown on `/start`. Technical model providers are **not** named in user-visible copy.

---

## 1. Principles

| Principle | Implementation |
| ----------- | ---------------- |
| No-command onboarding | `/start` sends a short HTML welcome + **main pillar** keyboard (`telegram_chat_handler`, `telegram_ux_menus.welcome_message_html`). |
| Nested menus | Pillar → track → (optional) topic prompt; callbacks use prefix **`u:`** (`telegram_ux_menus`, `telegram_poller._process_callback_query`). |
| Clean thread | **Same message is edited** when moving between main, pillar, about, info, and topic-prompt screens (`TelegramService.edit_message_html_in_chat`). |
| Contextual actions | **Cancel custom page** / **Cancel email** appear only on the messages that set `pending` state (`cancel_landing_reply_markup_json`, `cancel_email_reply_markup_json`). Post-report **📥 Export to PDF** sits on the delivery card (`telegram_post_task_markup`). |
| Branding | Footer on menu and instructional messages: *Built for Visionaries by Wael Safan & NewFinity*. |

---

## 2. Callback routing

| Prefix | Handler |
| ------ | ------- |
| `u:` | `process_ux_callback_query` in `telegram_ux_menus.py` (menus, topic capture, cancel landing/email). |
| `a:` / `d:` | Source approval (`resolve_approval_from_telegram_callback`). |
| `o` / `l` / `f` / … | Post-report exports (`process_post_task_callback`). |

`allowed_updates` for long polling includes `callback_query` and `message` (`telegram_poller.py`).

---

## 3. Menu hierarchy (Level 1 → Level 2)

### Level 1 — Main menu (`u:main`)

1. 🏢 Business & Market Intelligence — `u:p1`  
2. 🔬 Engineering & Technical Design — `u:p2`  
3. 🎨 Creative Media Studio — `u:p3`  
4. 🎬 Pro Video Generation — `u:p4`  
5. 🌐 Web & Landing Solutions — `u:p5`  
6. ℹ️ About — `u:abt`  

Every pillar view includes **⬅️ Back to Main Menu** (`u:main`).

### Level 2 — Examples

**Business (`u:p1`):** Market analysis, Competitive intelligence, Feasibility & business case, SWOT / strategic scan — each `u:t:<code>` (3-letter code).

**Engineering (`u:p2`):** Technical deep-dive, Architecture & systems, Implementation review.

**Creative (`u:p3`):** Photorealistic, Digital art, UI/UX concept, Architectural viz — each opens a **topic prompt** then expects **free text** for the image brief. **📷 Edit my photo** (`u:t:phe`) expects a **photo next** (caption optional); see [media_standards.md §1b](./media_standards.md#1b-photo-edit-reference-image--instruction--active).

**Video (`u:p4`):** **⏱️ 10 / 20 / 30** (`u:v:10` …) start Veo video generation — after tapping, send your **scene description** as the next text message (see [media_standards.md §2](./media_standards.md#2-pro-video-generation-veo--active)). **🔄 Animate image** remains a roadmap placeholder (`u:v:ani`).

**Web (`u:p5`):** Deep research report (`u:t:wrp` → topic prompt); Custom landing info (`u:il` → explains post-report **Landing page** button).

---

## 4. From buttons to text input

1. User taps a leaf that needs input (e.g. `u:t:bma` — market analysis).  
2. Bot **edits** the menu message to an HTML prompt: ask for the **next plain-text message** as topic/brief.  
3. `PendingUxFlow` is stored in-memory (`telegram_ux_pending.py`: `kind` = `mission_topic` or `image_style`, `return_menu` = `p1`…`p5`).  
4. User sends text → `consume_pending_ux_text_message` in `telegram_chat_handler` runs **after** landing/email pending handlers so structured flows stay ordered.  
5. **⬅️ Back** on the prompt (`u:bk:pN`) clears pending UX and **edits** back to pillar `N` without consuming a mission.

`/start` clears any stale `PendingUxFlow` and sends a **new** menu anchor (previous menu messages are not auto-deleted).

---

## 5. Escape hatches (not advertised on `/start`)

The Telegram UX is intentionally **button-driven**. Operational cancel/utility actions appear as **contextual buttons** only when relevant (for example canceling a pending landing brief or email delivery).

---

## 6. Related files

| File | Role |
| ---- | ---- |
| `telegram_agent_core/services/telegram_ux_menus.py` | Keyboards, `process_ux_callback_query`, topic/video copy. |
| `telegram_agent_core/services/telegram_ux_pending.py` | `PendingUxFlow` store. |
| `telegram_agent_core/services/telegram_poller.py` | Dispatches callback queries and private messages from polling. |
| `telegram_agent_core/services/telegram_service.py` | Telegram Bot API client + `edit_message_html_in_chat`. |
| `telegram_agent_core/services/telegram_post_task_markup.py` | Post-report inline row including **📥 Export to PDF**. |

Media specs for video durations and image styles: [media_standards.md](./media_standards.md).
