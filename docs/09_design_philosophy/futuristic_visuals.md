# Tunde Visual Philosophy — "Year 2100"

This document defines the **core visual design philosophy** for all Tunde **simulations** and **holograms** across tools. It is the reference for designers and engineers when adding or changing any 3D canvas experience in the product.

---

## 1. Core Philosophy

Tunde is not only an AI that answers questions — it is a **gateway to the future**. Every simulation should make the user feel they are **experiencing knowledge**, not merely reading it on a flat page.

**Target feeling:** *I am in the year 2100, and knowledge is alive around me.*

Visual richness, motion, and interaction are not decorative extras; they reinforce memory, curiosity, and trust that the product is serious about teaching and exploration.

---

## 2. The Golden Rule

Every tool that produces a **simulation** or **holographic view** **must** follow these rules:

| Rule | Requirement |
|------|-------------|
| **Textures** | Prefer **realistic textures** over flat solid colors wherever assets are available. |
| **Background** | Use an **environment-appropriate background** for each tool (lab, sky, field, etc.). |
| **Depth** | Render in **3D** with clear **depth cues**, **lighting**, and material response (not billboards-only unless justified). |
| **Interaction** | Be **interactive**: user can **rotate**, **zoom**, and **explore** (orbit controls or equivalent). |
| **Chrome** | Use **futuristic UI chrome**: **dark** canvas background, **cyan / purple** accent glows and borders consistent with the rest of Tunde. |

Fallbacks (solid colors, simplified geometry) are acceptable when assets fail or devices are constrained — but they are fallbacks, not the default target.

---

## 3. Per-Tool Visual Standards

The following table sets **directional standards** for current and planned education tools. Implementations should converge toward these rows over time.

| Tool | 3D object | Texture style | Background | Special effect |
|------|-----------|----------------|--------------|----------------|
| **Chemistry** | Molecules | Metallic atom spheres (CPK or agreed palette) | Dark lab / subtle particle field | Bond formation emphasis, stable CAD-style framing |
| **Space** | Planets, stars, orbital systems | Real planetary textures (e.g. NASA-style / Solar System Scope sources) | Milky Way skybox / deep space | Planet orbits, Sun glow, mission-appropriate presets |
| **Biology** *(future)* | Cells, DNA | Organic translucent materials | Dark microscope-style field | Cell division or process animation |
| **Physics** *(future)* | Waves, fields | Energy gradients | Dark grid field | Wave propagation / field visualization |
| **Math** *(future)* | 3D graphs & surfaces | Clean neon lines / surfaces | Dark grid | Surface morphing, clear axis readout |

Cross-cutting: **loading states**, **tone mapping**, and **performance budgets** apply to every row (see §4).

---

## 4. Technical Standards

| Topic | Standard |
|-------|----------|
| **Engine** | **Three.js** for all **WebGL** 3D rendering in the dashboard unless a documented exception exists. |
| **Textures** | Prefer authoritative or community-standard sources (e.g. **NASA**, **solarsystemscope.com**, or **procedurally generated** maps). Document unusual sources in the tool spec. |
| **Resilience** | **Always** provide a **fallback** to solid colors (and simpler materials) when textures fail to load (network, CORS, or CDN issues). |
| **Loading UX** | Show an explicit **loading state** while assets download; do not flash an empty canvas without feedback. |
| **Performance** | Target smooth interaction — typically **≤ 60 fps** on mid-range laptops; **cap geometry complexity**, texture resolution, and draw calls; use **ResizeObserver**-driven sizing rather than rebuilding scenes every frame. |

Known gaps in what we ship today — CORS, MVP scope, roadmap for APIs — are summarized in **[§6](#6-known-limitations--future-improvements)**.

---

## 5. Why This Matters (Business)

- **Differentiation:** Few competitors combine credible explanations with this level of **visual immersion** in-browser.
- **Retention:** Users **remember** distinctive experiences and are more likely to **return** when the product feels premium and alive.
- **Learning outcomes:** Students and practitioners **learn faster** when abstract concepts map to **spatial, animated** representations — especially in STEM.
- **Monetization:** Rich simulations support **premium positioning** — a justified part of **Pro / Business** tiers alongside API access, quotas, and team features.

---

## 6. Known Limitations & Future Improvements

### Current state (MVP)

- The **Three.js** solar system visualization is **functional but intentionally limited**: fixed diagram scales, illustrative orbits, and simplified lighting — enough to teach scale and motion without pretending to be a planetarium-grade ephemeris.
- **Planet textures** loaded from external CDNs are often **blocked by CORS** in a pure browser environment; the product relies on **Phong-style materials**, **emissive fills**, and **ambient / hemisphere lighting** so bodies stay vivid when textures fail — see the Space hologram implementation.
- **Heavy animation** (full **N-body** or **NASA-precision** orbital mechanics in real time) is **out of scope for MVP** and deferred to the roadmap below.

### Planned improvements (post-MVP)

- Integrate **NASA** and related **free** data sources where licensing and UX allow:
  - **NASA Solar System Exploration** API and companion datasets for facts and imagery.
  - Alignment or deep links with experiences such as **NASA Eyes on the Solar System** where embeddable or legally reusable.
  - **JPL Horizons** (or successor services) for **ephemeris-grade** orbital mechanics — proxied or computed server-side where appropriate, not as uncontrolled client traffic to legacy interfaces.
- Evaluate **Unity WebGL**, **Spline**, or similar for **premium** immersive scenes if WebGL-only Three.js hits a ceiling for specific campaigns or enterprise demos.
- **Dedicated 3D / technical art** capacity (contract or hire) once **revenue** supports it — not a blocker for shipping teaching-quality visuals today.
- **“Today” views**: approximate or live **planet positions for a chosen date**, fed by documented APIs and cached server-side where appropriate.

### Decision log

- **April 2026:** Ship **MVP visuals** that meet §2–§4 (readable, interactive, resilient) and prioritize **breadth of tools** over perfect astromechanics. Revisit NASA-grade data, alternative engines, and specialist art **when Tunde has paying users and sustainable revenue**.

---

## Related documentation

- [Tools overview](../08_tools/overview.md) — tool list, tiers, and roadmap.
- [Space Agent](../08_tools/space_agent.md) — Space hologram contract and phases.
- [Chemistry Agent](../08_tools/chemistry_agent.md) — Molecular hologram patterns.
- [Dashboard specification](../03_web_app_frontend/dashboard_spec.md) — chat canvas and workspace shell.
