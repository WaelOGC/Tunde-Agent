# Tunde Agent — Development Roadmap

This roadmap defines a **high-quality**, **modular**, and **anti-hallucination** development plan for **Tunde Agent**.

## Core philosophy (non-negotiable)

- **CEO (Tunde)**: the single main interface that receives user inputs and delivers final outputs.
- **Army (Sub-Agents)**: specialized agents across **25 domains** (Physics, Chemistry, Space, Geology, AI, Economy, etc.).
- **Quality Control (QC)**: an auditing layer that checks outputs, flags issues, and forces correction **before** the CEO responds.
- **Privacy-first voice**: voice cloning must be **local** (private recordings processed locally).
- **Personality engine**: Tunde must mimic the user’s wife’s tone (Friendly/Lovely/Cool + Angry/Tense states) based on provided datasets, with clear controls and safety boundaries.

## Operating rule (how we will work from now on)

1. Every new prompt must reference this file.
2. We update **only** the relevant step(s) **Current Status**.
3. We focus **only** on the **single current small task** (the next step marked `in_progress`).
4. No step is “done” without meeting its **Definition of Done**.

## Status legend

- `not_started`
- `in_progress`
- `blocked`
- `done`

---

## Phase 1 — Infrastructure & Backend (FastAPI & WebSockets)

### 1.1 Backend skeleton & runtime baseline
- **Goal**: A clean backend service boundary for real-time task execution.
- **Definition of Done**
  - FastAPI app boots in dev mode
  - `/health` endpoint exists
  - Structured JSON logging baseline exists
  - Minimal backend project structure exists under `tunde_webapp_backend/`
- **Current Status**: `done`

### 1.2 WebSocket transport (server side)
- **Goal**: Real-time bidirectional channel for progress updates.
- **Definition of Done**
  - WebSocket endpoint supports connect/disconnect
  - Server can broadcast progress events to a session/channel
  - Basic message envelope format documented (event type + payload + correlation id)
- **Current Status**: `done`

### 1.3 Task execution model (server-side orchestration)
- **Goal**: A deterministic pipeline that can be observed and audited.
- **Definition of Done**
  - Standard internal task lifecycle: `queued → running → qc_review → complete/needs_revision → failed`
  - Correlation IDs for every run + step
  - Progress events emitted for each lifecycle transition
- **Current Status**: `done`

### 1.4 QC gateway (backend enforcement point)
- **Goal**: CEO output cannot ship without QC clearance.
- **Definition of Done**
  - A QC interface exists (contract + implementation stub)
  - The orchestrator always routes candidate output through QC
  - Revision loop is bounded (max attempts + fail-safe behavior)
- **Current Status**: `done`

---

## Phase 2 — Database Design (hierarchical Agent Army + conversation logs)

### 2.1 Data model design (ERD + table list)
- **Goal**: A schema that supports CEO/Army/QC runs and long-lived conversations.
- **Definition of Done**
  - Documented ERD + migrations plan
  - Explicit tables defined for:
    - Agents (domains, capabilities, versions)
    - Agent assignments to tasks
    - Conversations, messages, artifacts
    - QC reviews and revision history
- **Current Status**: `done`

### 2.2 Implement “Agent Army” tables
- **Goal**: Persist who the agents are and what they can do.
- **Definition of Done**
  - Migrations created and applied
  - CRUD-ready queries exist (via repository/service layer)
  - Constraints: unique agent keys, versioning, active/inactive flags
- **Current Status**: `done`

### 2.3 Conversation & execution logs
- **Goal**: Auditability + replayability + analytics.
- **Definition of Done**
  - Message storage with correlation ids
  - Execution step logs stored (minimal but sufficient)
  - QC outcomes stored with references to the reviewed content
- **Current Status**: `done`

---

## Phase 3 — Real-time UI (Frontend)

Implementation note: Frontend is **JavaScript (ES6+ with JSX)** (no TypeScript).

**Phase 3 Status**: `done`

### 3.1 Frontend skeleton
- **Goal**: A simple UI capable of connecting and rendering progress.
- **Definition of Done**
  - App loads, authenticated session approach decided (even if mocked)
  - Basic layout established for the “Split Screen” dashboard
- **Current Status**: `done`

### 3.2 WebSocket integration (frontend)
- **Goal**: Show live progress from backend.
- **Definition of Done**
  - WebSocket connects + reconnect strategy
  - Events render in a timeline (right pane)
  - Input/output remains usable during long runs (left pane)
- **Current Status**: `done`

### 3.3 Task run UX (minimal viable)
- **Goal**: Start a task, see steps, see final CEO output.
- **Definition of Done**
  - “Run” initiates a backend job and subscribes to its channel
  - UI shows: running, QC review, revisions, done/failed
  - Final output is clearly separated from intermediate logs
- **Current Status**: `done`

---

## Phase 4 — Local Voice & Personality Engine (privacy-focused)

### 4.1 Local-only voice pipeline design (STT/TTS boundaries)
- **Goal**: Ensure voice recordings never leave the local machine.
- **Definition of Done**
  - Documented architecture: what runs locally vs server
  - Data handling rules: storage, encryption, deletion, consent
  - Threat model notes (what we protect against)
- **Current Status**: `not_started`

### 4.2 Voice cloning MVP (local)
- **Goal**: Generate Tunde voice from private recordings locally.
- **Definition of Done**
  - Local model selection + integration plan documented
  - Training/enrollment flow defined (inputs, outputs, time, hardware notes)
  - Output validation checklist (quality + privacy)
- **Current Status**: `not_started`

### 4.3 Personality / tone engine (wife-like states)
- **Goal**: Consistent tone switching (Friendly/Lovely/Cool/Angry/Tense) driven by datasets.
- **Definition of Done**
  - Tone taxonomy + triggers defined
  - Dataset ingestion format defined (what you provide, how it’s labeled)
  - Runtime policy: explicit guardrails so “Angry/Tense” never becomes abusive or unsafe
- **Current Status**: `not_started`

### 4.4 End-to-end voice interaction (local mic → STT → CEO → TTS)
- **Goal**: Real voice conversation with privacy preserved.
- **Definition of Done**
  - Local capture → STT → backend (text only) → response → local TTS
  - Toggle to disable voice features at any time
  - Audit logs do not store raw audio unless explicitly enabled
- **Current Status**: `not_started`

---

## Phase 5 — Agent Specialization (first 5 agents)

### 5.1 Agent contract (shared interface for all sub-agents)
- **Goal**: Prevent one-off agent behavior and hallucination-prone ad-hoc wiring.
- **Definition of Done**
  - Standard inputs/outputs schema for sub-agents
  - Required fields: assumptions, evidence, uncertainty, references
  - QC checklist compatibility (every agent output is auditable)
- **Current Status**: `not_started`

### 5.2 Build first 5 agents (thin but real)

Each agent is implemented as: **prompt/logic + tools allowed + expected output schema + QC checks**.

#### 5.2.1 Physics agent
- **Definition of Done**: Solves scoped physics questions with units, steps, checks; flags uncertainty.
- **Current Status**: `not_started`

#### 5.2.2 Chemistry agent
- **Definition of Done**: Handles reactions/stoichiometry safely; warns on hazardous instructions.
- **Current Status**: `not_started`

#### 5.2.3 Space agent
- **Definition of Done**: Space/astronomy summaries with citations; no fabricated mission data.
- **Current Status**: `not_started`

#### 5.2.4 Geology agent
- **Definition of Done**: Geology explanations with careful claims; distinguishes hypothesis vs fact.
- **Current Status**: `not_started`

#### 5.2.5 AI agent
- **Definition of Done**: Explains AI/ML concepts; gives implementable guidance; avoids overclaiming.
- **Current Status**: `not_started`

### 5.3 QC policies per domain
- **Goal**: QC becomes stricter as capabilities expand.
- **Definition of Done**
  - Domain-specific QC checklists exist for the first 5 agents
  - Automatic rejection criteria defined (missing evidence, contradictions, unsafe guidance)
- **Current Status**: `not_started`

