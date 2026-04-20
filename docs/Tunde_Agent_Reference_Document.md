# Tunde Agent — Comprehensive Reference Document

**Version:** 1.2  
**Last Updated:** 2026-04-20  
**Status:** Active Development (Pre-Release)  
**Legend:** ✅ Done | ⚠️ Bugs/Partial | ⏳ Planned | ❌ Not Started  

**Recent session (2026-04-20):** **Fixes:** (1) Tool outputs no longer mirror into every chat — `patchSessionMessages` in `App.jsx` now respects **`activeSessionIdRef.current`** together with `sessionId`. (2) **Business Agent** label — user-facing copy in `ChatCenter.jsx`, `App.jsx`, `BusinessAnalysisCanvas.jsx`, `BusinessSimulateModal.jsx`, `businessReportHtml.js`, and `canvasExportCore.js` says **Business Agent**; **`TundeHub.jsx`** still uses **Tunde Agent** as the product name. **Also this session:** Business Agent first slice (routes `/tools/business/*`, model `business_research`, `/db/business-research*`, Canvas + chat — bundle before ship). **Document Writer (2026-04-20):** section tabs (`DOCUMENT_SECTION_SPLIT`), scroll reset (`docBodyScrollRef` / `useLayoutEffect`), duplicate-tab merge/dedupe, `stripLeadingDuplicateDocTitle`, GFM tables (`document_writer.py` prompt + `DocumentWriterMarkdownTable` / `segmentDocumentWriterMarkdown` in `ChatCenter.jsx`). Removed `main.py` OAuth client id debug print.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Vision & Mission](#2-vision--mission)
3. [System Architecture Diagram](#3-system-architecture-diagram)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Architecture](#6-database-architecture)
7. [Tech Stack](#7-tech-stack)
8. [Features & Tools Status](#8-features--tools-status)
9. [API Reference](#9-api-reference)
10. [Canvas System](#10-canvas-system)
11. [Agent Army Architecture](#11-agent-army-architecture)
12. [Tunde Hub — Integrations](#12-tunde-hub--integrations)
13. [UI/UX Design System](#13-uiux-design-system)
14. [Subscription Tiers](#14-subscription-tiers)
15. [Known Issues & Roadmap](#15-known-issues--roadmap)
16. [Development Setup](#16-development-setup)

---

## 1. Project Overview

**Tunde Agent** is a multi-domain AI workspace combining intelligent conversation with specialized tools, rich visual outputs (3D simulations, interactive charts, Canvas pages), and persistent memory.

| Property | Value |
|----------|-------|
| **Product Name** | Tunde Agent |
| **Type** | AI Workspace SaaS |
| **Phase** | Active Development — Pre-Release |
| **Owner** | Wael |
| **Primary AI** | Gemini (HTML/visual), DeepSeek (structured JSON) |
| **Dev User ID** | `dev_user` (until auth is complete) |

---

## 2. Vision & Mission

> *"Replace the need for multiple disconnected tools with one intelligent workspace that adapts to any domain of knowledge."*

### Core Principles
- **CEO/Army/QC:** Every request → Tunde (CEO) → Specialized Agents → QC → Final response
- **Docs First:** Documentation before any code
- **Full-Stack Features:** Every feature = Backend + Database + Frontend together
- **Futuristic UX:** "Year 2100" — 3D holograms, interactive simulations, dark glassmorphism

---

## 3. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TUNDE AGENT SYSTEM                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    FRONTEND (React 19)              ✅ Done   │  │
│  │  Port 5173 (dev) │ Vite 7 │ Tailwind CSS                     │  │
│  │                                                              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │  Sidebar  │  │   Chat   │  │  Canvas  │  │ Tunde Hub  │  │  │
│  │  │  ✅ Done  │  │  ✅ Done │  │  ✅ Done │  │ ⚠️ Partial │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                    HTTP/WebSocket (port 8001)                       │
│                              │                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   BACKEND (FastAPI)                 ✅ Done   │  │
│  │  Port 8001 (dev) │ Port 8000 (Docker) │ Python 3.x           │  │
│  │                                                              │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │  │
│  │  │  /tools  │  │  /db     │  │  /auth   │  │ /api/pages │  │  │
│  │  │ ✅ +biz⚠ │  │  ✅ Done │  │ ⚠️ Part. │  │  ✅ Done   │  │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │  │
│  │                                                              │  │
│  │  WebSocket: /ws/tunde  ✅ Done                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                   DATABASE                          ✅ Done   │  │
│  │  SQLite (dev) │ PostgreSQL (Docker/prod)                      │  │
│  │                                                              │  │
│  │  conversations │ messages │ tool_results │ canvas_pages      │  │
│  │  published_pages │ user_integrations │ agents │ business_research │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 EXTERNAL AI PROVIDERS                        │  │
│  │                                                              │  │
│  │  ┌──────────────────┐    ┌──────────────────────────────┐   │  │
│  │  │  Gemini API  ✅  │    │  DeepSeek API  ✅            │   │  │
│  │  │  HTML/Visual gen │    │  Structured JSON tools       │   │  │
│  │  └──────────────────┘    └──────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Frontend Architecture

```
tunde_webapp_frontend/src/
│
├── App.jsx  ✅ (Main shell — 3200+ lines)
│   ├── Session management (sessions, activeSessionId)
│   ├── WebSocket connection (useTundeSocket)
│   ├── Tool submission handlers (submitMathProblem, etc.)
│   ├── Canvas state (landingOpen, canvasView, etc.)
│   ├── DB persistence (ensureDbConversation, saveToolResult, etc.)
│   └── Canvas caching (canvasGeneratedHtmlRef)
│
├── components/
│   ├── ChatCenter.jsx  ✅
│   │   ├── MessageBubbles (user + assistant)
│   │   ├── Tool solution blocks (MathSolutionBlock, etc.)
│   │   ├── Composer (multi-tool, file upload)
│   │   └── Processing indicators
│   │
│   ├── WorkspaceSidebar.jsx  ✅
│   │   ├── Conversation list (Today/Yesterday/Last 7 days)
│   │   ├── Tool badge per conversation
│   │   └── New Chat button
│   │
│   ├── LandingCanvasPanel.jsx  ✅
│   │   ├── Mode: landing (HTML preview)
│   │   ├── Mode: research (report + web page + infographic)
│   │   ├── Mode: code (syntax + HTML preview)
│   │   ├── Refine input (Apply to page)
│   │   ├── Regenerate button
│   │   └── Share/Publish/Download/Print
│   │
│   ├── 3D Viewers
│   │   ├── MoleculeHologram.jsx  ✅ (Three.js, CPK colors, auto-rotate)
│   │   └── SpaceHologram.jsx  ✅ (Solar system, orbits, starfield)
│   │
│   ├── DataChart.jsx  ✅
│   │   ├── Bar / Line / Pie / Scatter
│   │   └── Theme: Purple / Blue / Green / Orange
│   │
│   ├── CodeBlock.jsx  ✅ (highlight.js, copy button)
│   ├── AnatomyVisual.jsx  ✅ (SVG diagrams)
│   ├── TundeHub.jsx  ⚠️ (Google ✅, GitHub ⏳)
│   ├── BusinessAnalysisCanvas.jsx / BusinessSimulateModal.jsx  ⚠️ (Business Agent slice)
│   └── SettingsPanel.jsx  ✅
│
└── state/
    ├── useTundeSocket.js  ✅ (WebSocket hook)
    └── mockSession.js  ✅
```

### Frontend Data Flow

```
User types message
      ↓
App.jsx → submitUserMessage()
      ↓
1. ensureDbConversation() → POST /db/conversations
2. postDbMessage() → POST /db/messages (user msg)
3. Tool handler called (e.g. submitMathProblem)
      ↓
4. POST /tools/math → Backend
      ↓
5. Response received
      ↓
6. postDbMessage() → POST /db/messages (assistant msg)
7. saveToolResult() → POST /db/tool-results
8. UI updated → ChatCenter re-renders
      ↓
(Optional) Export Canvas
      ↓
9. POST /api/pages/generate → Gemini
10. postDbCanvasPage() → POST /db/canvas-pages
11. LandingCanvasPanel opens with HTML
```

### Canvas Caching System

```
User clicks "Create → Web page"
            ↓
Check canvasGeneratedHtmlRef[messageId::research::web_page]
            ↓
   ┌────────┴────────┐
 Found              Not Found
   ↓                    ↓
Use cached         POST /api/pages/generate
HTML (no API)            ↓
   ↓              Store in canvasGeneratedHtmlRef
Open Canvas              ↓
                    Open Canvas

User closes Canvas → HTML stays in ref
User clicks "Open" → Use cached HTML (no API)
User clicks "Regenerate" → Delete cache → New API call
```

---

## 5. Backend Architecture

```
tunde_webapp_backend/app/
│
├── main.py  ✅
│   ├── FastAPI app init
│   ├── CORS configuration
│   ├── Router registration
│   └── init_db() on startup
│
├── task_router.py  ✅  (All tool endpoints)
│   ├── POST /tasks/submit  (orchestrator)
│   ├── POST /tools/math
│   ├── POST /tools/science
│   ├── POST /tools/chemistry
│   ├── POST /tools/space
│   ├── POST /tools/health
│   ├── POST /tools/code
│   ├── POST /tools/translation
│   ├── POST /tools/research
│   ├── POST /tools/study
│   ├── POST /tools/data-analysis
│   ├── POST /tools/data-follow-up
│   └── POST /tools/document
│
├── business_router.py  ⚠️  (Business Agent — coordinate commit with model + frontend)
│   ├── POST /tools/business/research      → structured JSON + optional live search (Tavily/Serper)
│   ├── POST /tools/business/simulate      → scenario P/L projection (deterministic helper)
│   └── POST /tools/business/accounting/upload  → multipart CSV/text parse, persists snapshot
│
├── db_router.py  ✅  (Database CRUD)
│   ├── POST   /db/conversations
│   ├── GET    /db/conversations?user_id=
│   ├── GET    /db/conversations/{id}/messages
│   ├── POST   /db/messages
│   ├── POST   /db/tool-results
│   ├── GET    /db/tool-results/{conv_id}
│   ├── POST   /db/canvas-pages
│   ├── GET    /db/canvas-pages/{message_id}
│   ├── PUT    /db/canvas-pages/{canvas_id}
│   ├── GET    /db/business-research
│   └── GET    /db/business-research/{research_id}
│
├── pages_router.py  ✅  (Canvas generation)
│   ├── POST /api/pages/generate  → Gemini → HTML
│   ├── POST /api/pages/publish   → saved to DB
│   └── GET  /share/{page_id}     → serve HTML
│
├── auth_router.py  ⚠️
│   ├── GET /auth/google/start       ✅
│   ├── GET /auth/google/callback    ✅
│   ├── DELETE /auth/google/disconnect ✅
│   ├── GET /auth/github/start       ⚠️ (needs verification)
│   ├── GET /auth/github/callback    ⚠️ (needs verification)
│   └── GET /auth/status             ✅
│
├── ws_manager.py  ✅  (WebSocket manager)
│
├── landing_page_generator.py  ✅
│   ├── _LANDING_SYSTEM (improved prompt)
│   ├── generate_landing_document()
│   └── _fallback_document()
│
├── db.py  ✅
│   ├── database_url() (SQLite dev / PostgreSQL prod)
│   ├── build_engine()
│   └── init_db()
│
├── models/  ✅
│   ├── base.py
│   ├── conversation.py
│   ├── message.py
│   ├── tool_result.py
│   ├── canvas_page.py
│   ├── business_research.py  ⚠️
│   ├── published_page.py
│   ├── user_integration.py
│   ├── agent.py
│   ├── task_execution.py
│   └── qc_audit_log.py
│
└── tools/
    ├── math_solver.py       ✅
    ├── science_agent.py     ✅
    ├── chemistry_agent.py   ✅
    ├── space_agent.py       ✅
    ├── health_agent.py      ✅
    ├── code_assistant.py    ✅
    ├── translation_agent.py ✅
    ├── research_agent.py    ✅
    ├── study_assistant.py   ✅
    ├── data_analyst.py      ✅
    ├── document_writer.py   ⚠️ (backend OK; frontend markdown fixes in flight)
    └── business_agent.py    ⚠️ (first slice; live search optional via `search_tool`)
```

### Backend Request Flow

```
HTTP Request
     ↓
FastAPI Router (task_router.py)
     ↓
Tool Implementation (tools/*.py)
     ↓
     ├── Build prompt
     ├── Call LLM (DeepSeek or Gemini)
     ├── Parse JSON response
     └── Normalize/validate output
     ↓
Pydantic Response Model
     ↓
JSON Response → Frontend
```

### AI Provider Routing

```
Request Type                    Provider
─────────────────────────────────────────
Tool JSON responses   →   DeepSeek API
  (math, science,          (structured,
   chemistry, etc.)         fast, cheap)

HTML page generation  →   Gemini API
  (Canvas, landing,        (best at HTML,
   infographics)            creative, visual)
```

---

## 6. Database Architecture

### Schema Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE SCHEMA  ✅                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐         ┌────────────────────────┐    │
│  │    conversations     │         │    user_integrations   │    │
│  ├─────────────────────┤         ├────────────────────────┤    │
│  │ conv_id  UUID PK    │         │ integration_id UUID PK │    │
│  │ user_id  String     │         │ user_id     String     │    │
│  │ title    String     │         │ provider    String     │    │
│  │ tool_used String    │         │ enc_access_token Text  │    │
│  │ started_at DateTime │         │ enc_refresh_token Text │    │
│  │ ended_at DateTime   │         │ token_expires_at DT    │    │
│  └──────────┬──────────┘         │ created_at  DateTime   │    │
│             │                    │ updated_at  DateTime   │    │
│             │ 1:N                └────────────────────────┘    │
│             │                                                   │
│  ┌──────────▼──────────┐                                        │
│  │      messages        │                                        │
│  ├─────────────────────┤                                        │
│  │ message_id UUID PK  │                                        │
│  │ conv_id    UUID FK  │◄── CASCADE DELETE                      │
│  │ role       String   │    (user | ceo)                        │
│  │ content    Text     │                                        │
│  │ blocks_json Text    │◄── JSON array of rich blocks           │
│  │ tool_type  String   │                                        │
│  │ timestamp  DateTime │                                        │
│  └──────────┬──────────┘                                        │
│             │                                                   │
│    ┌────────┴────────┐                                          │
│    │                 │                                          │
│  ┌─▼───────────────┐ │  ┌────────────────────────────┐        │
│  │   tool_results   │ │  │       canvas_pages         │        │
│  ├─────────────────┤ │  ├────────────────────────────┤        │
│  │ result_id UUID  │ │  │ canvas_id   UUID PK        │        │
│  │ conv_id   FK    │ │  │ conv_id     UUID FK        │        │
│  │ message_id FK   │ │  │ message_id  String         │        │
│  │ tool_type String│ │  │ kind        String         │        │
│  │ input_data Text │ │  │   web_page / infographic   │        │
│  │ result_json Text│ │  │   data_export / landing    │        │
│  │ created_at DT   │ │  │ title       String         │        │
│  └─────────────────┘ │  │ html_content Text          │        │
│                      │  │ tool_type   String         │        │
│  ┌───────────────────┘  │ created_at  DateTime       │        │
│  │                      │ updated_at  DateTime       │        │
│  │ ┌──────────────────┐ └────────────────────────────┘        │
│  │ │ published_pages  │                                        │
│  │ ├──────────────────┤  ┌────────────────────────────┐       │
│  │ │ page_id  UUID PK │  │         agents             │       │
│  │ │ user_id  String  │  ├────────────────────────────┤       │
│  │ │ title    String  │  │ agent_id    UUID PK        │       │
│  │ │ html_doc Text    │  │ domain      String         │       │
│  │ │ created_at DT    │  │ version     String         │       │
│  │ └──────────────────┘  │ is_active   Boolean        │       │
│  │                       │ capabilities JSON          │       │
│  │ ┌──────────────────┐  └────────────────────────────┘       │
│  │ │ business_research │  ← Business Agent snapshots (JSON)      │
│  │ ├──────────────────┤                                        │
│  │ │ research_id PK   │                                        │
│  │ │ payload_json     │                                        │
│  │ └──────────────────┘                                        │
│  └►│ task_executions  │                                        │
│    │ task_status_evts │                                        │
│    │ qc_audit_logs    │                                        │
│    └──────────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
```

*(Diagram is illustrative; exact FK wiring may differ — see `models/business_research.py`.)*

### Database Configuration

```
Development:
  Engine:   SQLite
  File:     tunde_webapp_backend/tunde_dev.db
  URL:      sqlite:///./tunde_dev.db
  Reset:    del tunde_dev.db → restart backend

Production (Docker):
  Engine:   PostgreSQL 15
  Host:     db (Docker service)
  Port:     5433 (host-mapped)
  URL:      postgresql://tunde:tunde@db:5432/tunde
  Env var:  TUNDE_DATABASE_URL
```

### blocks_json Structure

```json
[
  {
    "type": "math_solution",
    "domain": "Algebra (Quadratic)",
    "steps": ["Step 1...", "Step 2..."],
    "final_answer": "x = -2, x = -3",
    "confidence": "high"
  },
  {
    "type": "canvas_card",
    "title": "Business Performance Report",
    "kind": "web_page",
    "messageId": "uuid-...",
    "generatedAt": "2026-04-19T22:00:00Z"
  },
  {
    "type": "data_solution",
    "dataset_name": "Business Data",
    "row_count": 12,
    "chart_data": { "labels": [], "datasets": [] },
    "key_insights": [],
    "ai_narrative": "..."
  }
]
```

---

## 7. Tech Stack

| Layer | Technology | Version | Status |
|-------|-----------|---------|--------|
| **Frontend Framework** | React | 19 | ✅ |
| **Build Tool** | Vite | 7 | ✅ |
| **CSS Framework** | Tailwind CSS | 3 | ✅ |
| **Charts** | Chart.js + react-chartjs-2 | latest | ✅ |
| **3D Graphics** | Three.js | r128 | ✅ |
| **Icons** | Lucide React | 0.447 | ✅ |
| **Code Highlighting** | highlight.js | latest | ✅ |
| **Backend Framework** | FastAPI | latest | ✅ |
| **Python** | Python | 3.x | ✅ |
| **ORM** | SQLAlchemy | 2 | ✅ |
| **HTTP Client** | httpx | latest | ✅ |
| **DB (Dev)** | SQLite | 3 | ✅ |
| **DB (Prod)** | PostgreSQL | 15 | ✅ |
| **AI (Visual)** | Gemini API | 2.5-flash | ✅ |
| **AI (Tools)** | DeepSeek API | deepseek-chat | ✅ |
| **Encryption** | Cryptography (Fernet) | latest | ✅ |
| **Containers** | Docker + Docker Compose | latest | ✅ |
| **Data Processing** | pandas | latest | ✅ |

---

## 8. Features & Tools Status

### Education Tools

| Tool | Backend | Database | Frontend | Visual | Status |
|------|:-------:|:--------:|:--------:|:------:|:------:|
| Math Solver | ✅ | ✅ | ✅ | Chart.js ✅ | ✅ Done |
| Science Agent | ✅ | ✅ | ✅ | — | ✅ Done |
| Chemistry Agent | ✅ | ✅ | ✅ | 3D Molecule ✅ | ✅ Done |
| Space Agent | ✅ | ✅ | ✅ | 3D Solar System ✅ | ✅ Done |
| Health Agent | ✅ | ✅ | ✅ | SVG Anatomy ✅ | ✅ Done |
| Study Assistant | ✅ | ✅ | ✅ | — | ✅ Done |

### Core Tools

| Tool | Backend | Database | Frontend | Canvas | Status |
|------|:-------:|:--------:|:--------:|:------:|:------:|
| Code Assistant | ✅ | ✅ | ✅ | HTML Preview ✅ | ✅ Done |
| Translation | ✅ | ✅ | ✅ | — | ✅ Done |
| Research Agent | ✅ | ✅ | ✅ | Web Page + Infographic ✅ | ✅ Done |
| Data Analyst Ph.1 | ✅ | ✅ | ✅ | Export Canvas ✅ | ✅ Done |
| Data Analyst Ph.2 | ✅ | ✅ | ✅ | Charts + Follow-up ✅ | ✅ Done |
| Data Analyst Ph.3 | ❌ | ❌ | ❌ | Google Drive/Gmail | ⏳ Planned |
| Document Writer | ✅ | ✅ | ✅ | Export Canvas ✅ | ✅ Done |

### Business & roadmap tools

| Tool | Backend | Database | Frontend | Status |
|------|:-------:|:--------:|:--------:|:------:|
| Business Agent | ⚠️ | ⚠️ | ⚠️ | ⚠️ First slice (research / simulate / accounting upload / Canvas); **commit as one bundle** |
| Design Agent | ❌ | ❌ | ❌ | ⚠️ In Development |
| Creative Writer | ❌ | ❌ | ❌ | ⏳ Next |

### Infrastructure

| Feature | Status | Notes |
|---------|:------:|-------|
| WebSocket real-time | ✅ | CEO pipeline status |
| Conversation persistence | ✅ | Survives page refresh |
| Sidebar history | ✅ | Today/Yesterday/7 days |
| Canvas (Landing) | ✅ | Workspace HTML pages |
| Canvas (Research) | ✅ | Web page + Infographic |
| Canvas (Code) | ✅ | HTML preview |
| Canvas caching | ✅ | No redundant API calls |
| Canvas saved cards | ✅ | "Open" button |
| Google OAuth | ✅ | Drive/Gmail/Calendar |
| GitHub OAuth | ⚠️ | Implemented, needs verification |
| Database (all tables) | ✅ | SQLite dev / PostgreSQL prod |
| Published pages | ✅ | Public `/share/{id}` |
| File upload | ✅ | `POST /files/upload` |
| Image generation | ✅ | Style wizard |
| Voice Engine | ❌ | Phase 4 |
| Real Auth (JWT) | ❌ | Currently "dev_user" |
| Multi-language UI | ❌ | Arabic + European |

---

## 9. API Reference

### Tool Endpoints

```
POST /tools/math
  Request:  { "problem": "solve x^2 + 5x + 6 = 0" }
  Response: { "domain", "steps", "final_answer", "confidence" }

POST /tools/science
  Request:  { "question": "..." }
  Response: { "topic", "explanation", "key_concepts", "further_reading" }

POST /tools/chemistry
  Request:  { "question": "..." }
  Response: { "topic", "explanation", "molecule": { atoms, bonds } }

POST /tools/space
  Request:  { "question": "..." }
  Response: { "topic", "explanation", "solar_system": { planets } }

POST /tools/health
  Request:  { "question": "..." }
  Response: { "topic", "explanation", "anatomy_svg", "disclaimer" }

POST /tools/code
  Request:  { "question": "...", "language": "python" }
  Response: { "language", "code", "explanation", "code_type" }

POST /tools/translation
  Request:  { "text": "...", "target_language": "Arabic" }
  Response: { "translated", "source_language", "target_language", "transliteration" }

POST /tools/research
  Request:  { "question": "..." }
  Response: { "topic", "summary", "key_findings", "sources" }

POST /tools/study
  Request:  { "topic": "..." }
  Response: { "topic", "summary", "key_concepts", "study_plan",
              "memory_tips", "practice_questions", "difficulty_level", "estimated_time" }

POST /tools/data-analysis
  Request:  { "data": "csv or json string", "dataset_name": "optional" }
  Response: { "dataset_name", "row_count", "summary_stats",
              "key_insights", "chart_data", "trends", "predictions", "ai_narrative" }

POST /tools/data-follow-up
  Request:  { "question": "...", "original_data": "...", "previous_analysis": {} }
  Response: { "answer": "..." }

POST /tools/document
  Request:  { "request": "write a business proposal for..." }
  Response: { "document_type", "title", "content", "sections", "word_count", "tone" }

POST /tools/business/research
  Request:  { "query", "user_id?", "session_id?", "include_live_search?" }
  Response:  BusinessAgentFullResponse shape (market/competitors/SWOT/etc.; optional live search when keys set)

POST /tools/business/simulate
  Request:  { "label?", "base_revenue", "revenue_growth_yoy", "cogs_ratio", "opex_ratio", "tax_rate", "periods" }
  Response: { "label", "assumptions", "pl_rows", "chart_series", "warnings" }

POST /tools/business/accounting/upload  (multipart/form-data: user_id, file)
  Response: { "ok", "research_id", ...parsed accounting fields }
```

### Database Endpoints

```
POST   /db/conversations
GET    /db/conversations?user_id=dev_user
GET    /db/conversations/{conv_id}/messages
POST   /db/messages
POST   /db/tool-results
GET    /db/tool-results/{conv_id}
POST   /db/canvas-pages
GET    /db/canvas-pages/{message_id}
PUT    /db/canvas-pages/{canvas_id}
GET    /db/business-research?user_id=...&session_id?=&limit?
GET    /db/business-research/{research_id}
```

### Pages Endpoints

```
POST /api/pages/generate   → { context, title_hint } → { html, title }
POST /api/pages/publish    → { html_document, title, user_id } → { share_url }
GET  /share/{page_id}      → HTML page
```

---

## 10. Canvas System

```
User Action
    ↓
┌──────────────────────────────────────────────────────────┐
│                  CANVAS TRIGGER                           │
│                                                          │
│  Research Agent completes  →  canvasView = "research"   │
│  Code Assistant completes  →  canvasView = "code"       │
│  "Preview in Canvas" chip  →  canvasView = "landing"    │
│  Data Export button        →  canvasView = "landing"    │
└──────────────────────────────────────────────────────────┘
    ↓
LandingCanvasPanel opens (right panel, 60% width)
    ↓
┌──────────────────────────────────────────────────────────┐
│  RESEARCH MODE                                           │
│  ├── Report tab    (formatted research report)           │
│  ├── Preview tab   (rendered HTML in iframe)             │
│  ├── Create ▼      (🌐 Web page | 📊 Infographic)       │
│  └── Refine input  (Apply to page)                      │
│                                                          │
│  CODE MODE                                               │
│  ├── Code tab      (syntax highlighted)                  │
│  └── Preview tab   (rendered HTML)                      │
│                                                          │
│  LANDING MODE                                            │
│  ├── Preview tab   (rendered HTML in iframe)             │
│  ├── Code tab      (raw HTML source)                     │
│  └── Refine input  (Apply to page)                      │
└──────────────────────────────────────────────────────────┘
    ↓
Toolbar: Print | Copy | Share | Download | Code | View Page | Regenerate | ✕
```

---

## 11. Agent Army Architecture

```
┌────────────────────────────────────────────────────────────┐
│                   CEO (Tunde)                              │
│  Receives user input, routes to appropriate agent          │
└───────────────────────┬────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ↓                               ↓
┌───────────────┐               ┌───────────────┐
│  Agent Army   │               │  QC Auditor   │
│               │               │               │
│ ✅ Math       │     ──────►   │ Reviews all   │
│ ✅ Science    │               │ agent outputs │
│ ✅ Chemistry  │               │ for accuracy  │
│ ✅ Space      │               └───────┬───────┘
│ ✅ Health     │                       │
│ ✅ Code       │               ┌───────▼───────┐
│ ✅ Translation│               │  CEO (Tunde)  │
│ ✅ Research   │               │  Delivers     │
│ ✅ Study      │               │  final answer │
│ ✅ Data       │               └───────────────┘
│ ⚠️ Document  │
│ ⚠️ Business  │
│ ⏳ Design    │
│ ❌ Creative  │
│ ❌ Voice     │
└───────────────┘

Note: Pipeline runs entirely in background.
Users only see the final polished response.
```

---

## 12. Tunde Hub — Integrations

```
┌──────────────────────────────────────────────────────────┐
│                    TUNDE HUB                             │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Google Drive │  │    Gmail     │  │   Calendar   │  │
│  │    ✅ OAuth  │  │   ✅ OAuth   │  │   ✅ OAuth   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │    GitHub    │  │    Slack     │  │   Notion     │  │
│  │  ⚠️ Partial │  │   ❌ Future  │  │  ❌ Future   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────┘

OAuth Flow:
User → "Connect" → GET /auth/google/start
  → Google consent screen
  → GET /auth/google/callback
  → Token encrypted (Fernet) + stored in user_integrations
  → Hub shows "Connected ✅"
```

---

## 13. UI/UX Design System

### Color Palette

| Role | Hex | Tailwind |
|------|-----|---------|
| Background | `#0a0f1a` | `bg-tunde-bg` |
| Surface | `#0f1723` | `bg-tunde-surface` |
| Accent | `#7c3aed` | `violet-600` |
| Text primary | `#ffffff` | `text-white` |
| Text muted | `#94a3b8` | `text-slate-400` |
| Success | `#10b981` | `emerald-500` |
| Warning | `#f59e0b` | `amber-500` |
| Error | `#ef4444` | `red-500` |

### Tool Color Themes

| Tool | Color |
|------|-------|
| Math Solver | Amber/yellow |
| Science Agent | Emerald/green |
| Chemistry Agent | Orange |
| Space Agent | Indigo/violet |
| Health Agent | Green |
| Code Assistant | Blue |
| Translation | Indigo |
| Research Agent | Amber |
| Study Assistant | Sky blue |
| Data Analyst | Teal/cyan |
| Document Writer | Slate/blue |

### Card Standard (Glassmorphism)

```css
border-radius: 1rem;
border: 1px solid rgba(255,255,255,0.1);
background: rgba(15,23,35,0.6);
backdrop-filter: blur(16px);
box-shadow: 0 25px 50px rgba(0,0,0,0.4);
```

### 3D Viewer Standards ("Year 2100")

```
Background:  #050a18
Glow:        box-shadow: 0 0 20px rgba(0,150,255,0.2)
Axes:        X=red, Y=green, Z=blue
Controls:    OrbitControls — drag, zoom, rotate 360°
Auto-rotate: Yes, pauses on user interaction
```

---

## 14. Subscription Tiers

| Feature | Free | Pro | Business | Enterprise |
|---------|:----:|:---:|:--------:|:----------:|
| Core tools | ✅ | ✅ | ✅ | ✅ |
| Education tools (basic) | ✅ | ✅ | ✅ | ✅ |
| Education tools (advanced) | ❌ | ✅ | ✅ | ✅ |
| Research Agent | ❌ | ✅ | ✅ | ✅ |
| Data Analyst | ❌ | ✅ | ✅ | ✅ |
| Canvas (Web page, Infographic) | ❌ | ✅ | ✅ | ✅ |
| Document Writer | ❌ | ✅ | ✅ | ✅ |
| Tunde Hub (Google/GitHub) | ❌ | ✅ | ✅ | ✅ |
| Business Agent | ❌ | ❌ | ✅ | ✅ |
| Design Agent | ❌ | ❌ | ✅ | ✅ |
| Creative Writer | ❌ | ❌ | ✅ | ✅ |
| API Access | ❌ | ❌ | ✅ | ✅ |
| Voice Engine | ❌ | ❌ | ❌ | ✅ |
| Custom integrations | ❌ | ❌ | ❌ | ✅ |

---

## 15. Known Issues & Roadmap

### Current Bugs

| Priority | Component | Issue |
|----------|-----------|-------|
| ✅ Fixed (2026-04-20) | `App.jsx` — session patch | Tool responses were applied to **all** sessions; **`patchSessionMessages`** now guards with **`activeSessionIdRef.current`** plus `sessionId` so only the active session updates. |
| ✅ Fixed (2026-04-20) | `App.jsx` — `patchSessionMessages` operators | **`&&` vs `\|\|` bug:** using `\|\|` meant patches only applied when the session matched **both** `activeSessionIdRef.current` **and** `sessionId` — dropped patches on fast session switches. Fixed by switching to `&&` so a row is unchanged only when it matches **neither** (~line 810). Fixed: 2026-04-20. |
| ✅ Fixed (2026-04-20) | Business Agent UI label | Tool/composer/canvas strings incorrectly showed **Tunde Agent**; fixed in `ChatCenter.jsx`, `App.jsx`, `BusinessAnalysisCanvas.jsx`, `BusinessSimulateModal.jsx`, `businessReportHtml.js`, `canvasExportCore.js` → **Business Agent**. **`TundeHub.jsx`** unchanged (product name). |
| ✅ Fixed (2026-04-20) | Document Writer — section tabs (`ChatCenter.jsx`) | Heading split regex updated to handle all levels **`#`–`######`** (`DOCUMENT_SECTION_SPLIT`). |
| ✅ Fixed (2026-04-20) | Document Writer — truncated content (`ChatCenter.jsx`) | Scroll anchor reset: **`docBodyScrollRef`**, **`useLayoutEffect`** (`scrollTop = 0`), **`overflowAnchor: none`**, in-container scroll for tabs. |
| ✅ Fixed (2026-04-20) | Document Writer — duplicate tab (`ChatCenter.jsx`) | **`mergeAdjacentDuplicateHeadingParts`** + **`stripLeadingAtxLine`** + consecutive **nav** label dedupe. |
| ✅ Fixed (2026-04-20) | Document Writer — raw `#` title (`ChatCenter.jsx`) | **`stripLeadingDuplicateDocTitle`** / **`bodyForDoc`** removes repeated title line. |
| ✅ Fixed (2026-04-20) | Document Writer — tables | **`document_writer.py`** — GFM pipe tables in prompt; **`DocumentWriterMarkdownTable`**, **`segmentDocumentWriterMarkdown`** in **`ChatCenter.jsx`**. |
| 🟢 Fixed (2026-04-20) | Backend startup | ~~`main.py` printed `GOOGLE_CLIENT_ID` to stdout~~ — removed; rotate OAuth client if logs were exposed |
| 🟢 Low | Document Writer UI (optional) | Spot-check text contrast on light panels in edge-case themes |
| 🟡 Med | Repo hygiene | Business Agent router + model + tool + frontend files must be **committed together** — partial commits break imports |
| 🟡 Med | Live web search | Business (and research) enrichment needs `TAVILY_API_KEY` or `SERPER_API_KEY`; otherwise summaries may be LLM-only |
| 🟡 Med | GitHub OAuth | End-to-end verification needed |
| 🟡 Med | Space Agent 3D | Planet textures blocked by CORS |
| 🟢 Low | Health Agent SVG | Basic schematic diagrams only |

### Development Roadmap

```
CURRENT SPRINT
├── ✅ Core 11 legacy tools + data follow-up
├── ⚠️ Business Agent (first slice — finish commit + QA)
├── ✅ Database (incl. business_research when migrated)
├── ✅ Conversation history + Canvas system
├── ⚠️ Document Writer (markdown track — regression QA)
└── ⏳ Design Agent — Phase 1 brand identity (full stack; docs: `docs/08_tools/design_agent.md`, `design_agent_spec.md`)

NEXT (Phase 2)
├── ⏳ Complete Business Agent (tiers, polish, docs)
├── ⏳ Document Writer — close remaining UI gaps after QA
└── ⏳ Creative Writer (full stack)

FUTURE (Phase 3)
├── ⏳ Data Analyst Ph.3 (Google Drive + Gmail)
├── ⏳ GitHub Integration (complete)
├── ⏳ Multi-language UI (Arabic + European)
└── ⏳ Real Auth (JWT)

LONG TERM (Phase 4+)
├── ❌ Voice Engine (local, privacy-first)
├── ❌ Official Marketing Website
├── ❌ NASA API (real planet data)
└── ❌ Mobile App
```

---

## 16. Development Setup

### Environment Variables (`.env`)

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEFAULT_LLM_PROVIDER=gemini

# Optional live web search (Business + Research tooling): Tavily preferred, else Serper
TAVILY_API_KEY=
SERPER_API_KEY=

TUNDE_DATABASE_URL=sqlite:///./tunde_dev.db

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://127.0.0.1:8001/auth/google/callback

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://127.0.0.1:8001/auth/github/callback

ENCRYPTION_KEY=
TUNDE_WEBAPP_PUBLIC_URL=http://127.0.0.1:8001
OAUTH_SUCCESS_REDIRECT=http://localhost:5173/integrations?status=connected
OAUTH_FAILURE_REDIRECT=http://localhost:5173/integrations?status=error
```

### Running Commands

```bash
# Frontend
cd tunde_webapp_frontend
npm install && npm run dev        # port 5173

# Backend
cd tunde_webapp_backend
py -m uvicorn tunde_webapp_backend.app.main:app --reload --port 8001

# Reset database (PowerShell)
Remove-Item -Force .\tunde_dev.db
# Restart backend → tables recreated automatically

# Docker (PostgreSQL + app)
docker-compose up                  # app:8000, db:5433
```

### Generate Encryption Key

```python
py -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

*Maintained by Wael. Update whenever features are added, bugs fixed, or decisions change.*  
*For AI assistants: Read this file + `docs/PROJECT_CONTEXT.md` for full project context.*
