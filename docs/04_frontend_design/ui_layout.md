# Frontend UI — Tunde Workspace

The web UI lives in `tunde_webapp_frontend/`. It is **JavaScript-only (ES6+ with JSX)** and styled with **Tailwind CSS**.

**Browser title:** `Tunde - Workspace`

---

## 1. Layout (Gemini-style workspace)

- **Left sidebar (~260px)**  
  - **Top:** Tunde mark, name, **v0.1.0**, “New chat”  
  - **Middle:** Recent sessions (list)  
  - **Bottom:** Settings entry, **connection status** (green = connected, red = server offline)

- **Center**  
  - Conversation stream: **user bubbles** (right-aligned accent) vs **Tunde bubbles** (left, neutral / final-response highlight)  
  - **Input** fixed at bottom: textarea, **Send**, **+** opens a small **Tools** menu (Search / Memory / Vision — placeholders for now)

- **Right — Activity / process (desktop)**  
  - **Agent → QC → CEO** as clean steps with compact badges  
  - **Collapsible** to a slim strip (large screens)

- **Mobile**  
  - **☰** opens the sidebar drawer  
  - **Process** opens the activity drawer from the right  

---

## 2. Components (current)

| File | Role |
|------|------|
| `src/App.jsx` | Sessions, routing (chat vs settings), WebSocket + submit wiring, mobile drawers |
| `src/components/WorkspaceSidebar.jsx` | Brand, version, sessions, settings, connection |
| `src/components/ChatPane.jsx` | Messages, typing state, composer, tools popover |
| `src/components/ActivityProcessPanel.jsx` | Collapsible process strip + step badges + live line |
| `src/state/useTundeSocket.js` | WebSocket client → `ws(s)://<host>/ws/tunde` |

---

## 3. Backend wiring

- **HTTP:** `POST /tasks/submit` with `payload.user_id`, `payload.user_message`
- **WebSocket:** `/ws/tunde` — `task_status_change`, `qc_rejection`, etc.
- **Final reply:** On `complete`, the chat appends a **Tunde** message from the event payload (CEO path).

---

## 4. Palette

Deep grays (`#0c0e12`, `#14161c`), slate borders, **sky** accent for primary actions and user bubbles; **emerald** tint for final CEO-style replies.
