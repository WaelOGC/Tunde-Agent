# Multi-agent system (MAS)

This document reflects the **current** multi-agent layout in the repository: orchestration entrypoints, specialized roles, **Gemini vs DeepSeek routing**, and boundaries between **infrastructure** and **user-driven customization**.

---

## 1. Roles and code map

| Agent (concept) | Responsibility | Primary modules |
| ----------------- | ---------------- | ---------------- |
| **Orchestrator (Tunde)** | Intent → research mission lifecycle, approvals, delivery | `mission_service`, `research_orchestration/orchestrator.py` |
| **Research agent** | URL discovery, parallel fetch, vision on figures | `search_agent`, `extraction_agent`, `vision_agent` |
| **Analyst agent** | Plans, synthesis JSON, verification, quality gate, structured extraction/designer JSON | `sub_agents.py`, `agent_prompts.py`, prompts under `research_orchestration/prompts/` |
| **UI/UX agent** | Telegram HTML briefing, default report shell, custom LLM landing pages | `telegram_markdown_v2`, `report_html`, `agents/uiux_agent.py`, `generation_service.py` |

Python package façade: `tunde_agent.multi_agent` (`coordinator.py`, `model_router.py`, `agents/*`).

---

## 2. Model routing (Gemini vs DeepSeek)

`multi_agent/model_router.py` defines **`TaskKind`** and **`resolve_llm_client(settings, kind)`**:

| Task kind | Typical use | Preferred provider |
| --------- | ----------- | -------------------- |
| `VISION` | Multimodal figure reads | **Gemini** (required; no vision path on DeepSeek client here) |
| `STRUCTURED_JSON` | Extractor, verifier, designer LLM JSON | **DeepSeek** if `DEEPSEEK_API_KEY` is set, else Gemini |
| `ORCHESTRATION_JSON` | Master plan / master gate JSON | **DeepSeek** if configured, else Gemini |
| `RESEARCH_SYNTHESIS` | Analyst narrative JSON | **Gemini** if configured, else DeepSeek |
| `CREATIVE_UI` | Custom landing HTML generation | **Gemini** if configured, else DeepSeek |

Research pipeline calls use **`task_kind_for_research_role(role)`** from `sub_agents.llm_json` so JSON-heavy steps prefer DeepSeek without rewriting orchestration.

**Adding a new provider:** implement `BaseLLM` in `llm_service.py`, register it in **`build_llm_client`**, then extend **`resolve_llm_client`** (and optionally add `TaskKind` values).

---

## 3. Deep research & reporting

- Orchestrator system prompt (`agent_prompts.MASTER_ORCHESTRATOR_SYSTEM`) encodes a **deep research standard** (data-backed claims, professional tone, explicit limits).
- Analyst / extractor prompts require structured fields and sourcing (see `prompts/analyst_prompt.py`).
- Telegram delivery uses **`UIUXAgent.format_mission_teaser_html`**: section headings, separators, blockquote thesis, numbered signals, optional **ASCII bar chart** from `analyst_chart_metrics`.
- **Custom landing pages** are operator-briefed via Telegram (`generation_service.py`); output is **not** a fixed template and overwrites `data/reports/{uuid}.html` after the two-step flow (see `telegram_pending_landing_design.py`).

---

## 4. Infrastructure vs user inputs

| Layer | What it is | Examples |
| ----- | ---------- | -------- |
| **Infrastructure** | Core runtime, policies, DB, browser, routing, default report writer | FastAPI, Docker, RLS, `run_post_approval_pipeline`, `build_landing_page_html` on mission complete |
| **User inputs / customization** | Operator-controlled presentation and exports | Telegram design brief → `generate_custom_landing_html`, future “design brief” hooks for PDF/DOCX (see comments in `generation_service.py`) |

---

## 5. Future roadmap: self-evolution framework

**Upcoming phase (not implemented as autonomous loops today)** — product and safety gates remain in [../05_project_roadmap/self_improvement_rules.md](../05_project_roadmap/self_improvement_rules.md) and [../01_telegram_bot/human_approval_gate.md](../01_telegram_bot/human_approval_gate.md):

1. **Market awareness** — Scheduled or on-demand web search to summarize industry trends; outputs feed **read-only** research suggestions (no auto-deployment).
2. **Feedback loop** — Aggregate operator reactions (e.g. approval latency, export usage) into **offline** evaluation datasets; propose prompt or routing tweaks as **human-reviewed** diffs.
3. **Internal simulation** — Sandbox runs of new `TaskKind` → provider mappings or UI templates against golden missions; **no** silent promotion to production.
4. **UI evolution** — LLM-generated layout experiments stay behind feature flags until a human publishes.

Until then, all behavioral change stays **kernel-tier** (code + migrations + docs), not self-modifying runtime state.

---

## 6. Related docs

- [architecture.md](./architecture.md) — system boundaries  
- [current_implementation.md](./current_implementation.md) — routes and mission steps  
- [../05_project_roadmap/self_improvement_rules.md](../05_project_roadmap/self_improvement_rules.md) — adaptive behavior limits  
