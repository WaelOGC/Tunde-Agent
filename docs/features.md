# Features

Capability catalog for Tunde Agent’s initial product surface, described in acceptance-oriented terms. System shape and boundaries are in [architecture.md](./architecture.md). Deployment and environments are in [infrastructure.md](./infrastructure.md). Deferred work and phasing appear in [roadmap.md](./roadmap.md). Safety and self-improvement constraints are in [self_improvement_rules.md](./self_improvement_rules.md).

---

## 1. Email automation

The agent assists with **reading**, **drafting**, and **organizing** mail while respecting provider limits and a **human approval gate** for outbound send in the MVP.

### 1.1 Reading, search, and thread context

- **Search** — Query across sender, subject, body snippets, date ranges, and labels where the provider exposes them; results return as ranked lists with stable message identifiers for follow-up actions.
- **Thread context** — For a selected conversation, the product loads **thread-level context** (participants, chronological snippets, attachments metadata) so the model and UI can summarize or act without re-fetching redundantly.
- **Operational notes** — Large mailboxes may require pagination, incremental sync assumptions, and rate limits imposed by IMAP or HTTP APIs; failures surface as recoverable states rather than silent drops.

### 1.2 Drafting and send control

- **Drafting** — The agent proposes replies or new messages in the user’s voice and constraints (tone, length, language); drafts are **editable** before any send.
- **Human approval gate** — **Sending** requires an explicit user confirmation in MVP (no unattended mass send). Scheduled or batched send, if added later, remains policy-governed per [self_improvement_rules.md](./self_improvement_rules.md).

### 1.3 Organizing

- **Labels and folders** — Apply or suggest labels, move messages between folders, and align with the user’s existing taxonomy where the provider allows programmatic updates.
- **Rules** — Persist **user-defined or agent-proposed rules** (filters, auto-labels) in application storage tied to the architecture in [architecture.md](./architecture.md), with provider-specific caps on rule count or complexity called out in product messaging when relevant.

---

## 2. Advanced web research

Research flows follow the pipeline described architecturally: **fetch → extract → LLM synthesis → structured outputs**, under **rate limits**, **robots.txt**, and **terms of service** constraints.

### 2.1 Competitor analysis

- **Comparison tables** as a first-class **output type**: entities (products, vendors, plans) as rows; attributes (pricing signals, feature flags, positioning) as columns, with **source attribution** and **as-of timestamps** where feasible.
- **Competitor data** distinguishes **factual extraction** (from crawled or user-supplied pages) from **interpretive synthesis** (narrative differentiation), so users can see what is grounded in a URL versus model inference.

### 2.2 Product analysis and data extraction

- **Product analysis** — Specs, pricing cues, packaging tiers, and availability hints extracted from product pages, docs, and structured snippets; ambiguous or JavaScript-heavy pages may yield partial extractions—limitations are communicated in the artifact.
- **Data extraction** — Normalization into **tables**, **bullet fact lists**, or **JSON-shaped logical models** (described in prose here, not as executable schema) suitable for export and downstream chat context.

### 2.3 Review sentiment scoring

- **Methodology (high level)** — Aggregate review text (and ratings where present), apply **deterministic aggregation** (counts, distributions) where possible, and use the **LLM abstraction** for nuanced sentiment themes, with explicit **limitations**: sampling bias, fake reviews, stale data, and model **hallucination** on thin evidence.
- **Outputs** — Scores or bands (e.g., positive or mixed or negative) plus **short rationales** tied to quoted or paraphrased evidence where policy allows.

---

## 3. Browser navigation and task execution

- **Scripted flows** — Repeatable sequences (login-assisted tasks only with user consent, form fill with allowlisted domains) executed through the **Browser Automation layer** (Playwright primary; optional orchestration patterns noted in [architecture.md](./architecture.md)).
- **LLM-driven navigation** — Higher-variability browsing under **domain allowlists**, step budgets, and **sensitive action confirmations** (payments, account deletion, bulk changes).
- **Safety** — Aligns with the risk themes in [roadmap.md](./roadmap.md) and the enforcement model in [self_improvement_rules.md](./self_improvement_rules.md).

---

## 4. Cross-feature requirements

- **Audit trail** — Material tool actions (email sends after approval, research runs, browser sessions) leave **durable references** suitable for later review (who, what, when—not necessarily full raw HTML retention).
- **Undo** — Where the provider supports reversal (e.g., undo move, unlabel), expose undo; where not, provide **clear state** and recovery guidance.
- **Export** — Research artifacts (tables, summaries) exportable in common document or data forms for offline use.

---

## 5. Explicit exclusions (MVP)

The following are **out of scope** for the initial web MVP and are tracked in [roadmap.md](./roadmap.md):

- **Desktop or OS-level control** (local companion, system automation).
- **Public multi-user** product surface, tenant isolation at scale, and compliance-grade controls (Phase 3).
- **Unattended high-risk automation** without human gates (financial transactions, bulk email, destructive operations).

---

## 6. Relationship to infrastructure

Feature behavior assumes **localhost development** and **production on a VPS** as described in [infrastructure.md](./infrastructure.md): the API and Browser Automation layer must reach email providers and the public web under the same policy constraints in every environment.

---

## 7. Implemented in the repository (snapshot)

The sections above state **product intent** (email read/draft/organize, SPA, broad research outputs). The following capabilities are **wired in code today**; for routes, env vars, and tables see [current_implementation.md](./current_implementation.md). For **`TUNDE_RESEARCH_OUTPUT_LANG`** and **`TUNDE_RESEARCH_SEARCH_LOCALES`** (report language vs search regions), see [research_language_and_search_locales.md](./research_language_and_search_locales.md).

- **LLM chat** — `POST /chat` with **Gemini** or **DeepSeek** (`DEFAULT_LLM_PROVIDER`); minimal **audit** metadata (no full prompt storage on that path).
- **Bounded browsing** — `GET /test-browse` and Playwright-backed research fetches with **CAPTCHA policy** alignment ([captcha_handling_policy.md](./captcha_handling_policy.md)).
- **Research missions** — `POST /mission/start` (async **202**): URL discovery (optional **HTTP SERP** chain: Google CSE → Serper → Riley, then browser fallbacks), **Telegram** screenshot + **human approval** (`approval_requests` + inline keyboard), then **multi-agent orchestration** (extraction, analyst, verifier, master quality gate, optional vision/designer paths), **HTML report** on disk, **public report URL** via `/reports/view/{id}`.
- **Telegram operator UX** — Long-polling bot: **`/research`**, **`/analyze`**, **`/mission`**, natural “research on …” / “analysis of …” phrasing, regex-triggered **complex** missions (e.g. market / feasibility wording), conversational chat with short history, **native Gemini image generation** when prompts match configured patterns, **`/help`**, **`/done`**, **`/cancel_email`**.
- **Post-report actions** — From Telegram: **PDF**, **Word (DOCX)**, **CSV**, alternate **HTML**, optional **SMTP** send, **Q&A on the report**, **compare** with a prior report, **summarize**.
- **Persistence** — PostgreSQL with **RLS** for `audit_logs`, `approval_requests`, `encrypted_data`, etc.; optional **field-level encryption** when `ENCRYPTION_KEY` is set.

**Email:** Full **IMAP read / thread UI / provider rules** described in §1 are **not** implemented as an integrated mail client in this tree. **Outbound SMTP** exists for the **report delivery** path (post-mission “send to email”), not for general mailbox automation.

**Frontend SPA:** Not present in the repository; architecture §3 notes the gap explicitly.
