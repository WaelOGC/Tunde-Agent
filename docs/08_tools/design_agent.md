# Design Agent — User Guide & Product Overview

**Related:** Technical architecture and implementation checklist — [Design Agent architecture & spec](./design_agent_spec.md).

---

## Overview

**Design Agent** is an AI-powered **brand identity** tool built into the Tunde workspace. From a short business brief and stylistic preferences, it produces a cohesive package: **color palette**, **typography system**, **logo concepts** (including scalable SVG), and **brand guidelines** — surfaced in a dedicated **Design Canvas** with tabbed exploration and exports.

It is intended for founders and teams who need a professional starting point fast, not a substitute for human brand sign-off on high-stakes launches.

---

## User flow — four-step wizard

The experience is a linear **four-step wizard** that gathers context before generation:

1. **Business info** — Brand or company name, industry (e.g. Tech, Food, Fashion, Health, Finance, Education, Other), and a one-line description.
2. **Audience & tone** — Target audience text and a **tone** grid (e.g. Minimal, Bold, Elegant, Playful, Corporate, Futuristic, Natural, Retro).
3. **Style preferences** — **Color mood** (e.g. Dark & Dramatic, Light & Clean, Warm & Earthy, Cool & Professional, Vibrant & Energetic, Pastel & Soft) and **logo style** (e.g. Wordmark, Lettermark, Abstract, Geometric).
4. **Confirm & generate** — Summary of all inputs, a primary action to **generate the brand identity**, and an approximate wait hint (~15 seconds).

After generation, users open the **Design Canvas** to review, tweak context (e.g. regenerate where supported), and export assets.

---

## Brand identity output — main components

The generated package includes:

### Color palette

Named swatches with **hex** values, roles (e.g. Primary, Secondary, Accent), and short **usage** notes (backgrounds, CTAs, neutrals). The canvas exposes HEX (and supporting formats where implemented) with copy-friendly interactions.

### Typography

A structured recommendation typically including:

- **Heading** — Font family, weight, and usage (hero, headlines).
- **Body** — Font family, weight, and usage (paragraphs, UI copy).
- **Accent** — Optional third style for labels, captions, or monospace-flavored treatments.

Previews align with the chosen brand name and scale (e.g. headline through body).

### Logo

- **Primary logo** — Often delivered as **SVG** for crisp scaling and editability.
- **Monogram / icon** — A compact mark for favicons, app icons, and tight layouts.

The canvas supports light/dark previews and download of vector and raster variants where the product implements them.

### Brand guidelines

A structured “brand book” narrative covering:

- **Brand story** — Short positioning text.
- **Color rules** — Do’s, don’ts, and contrast intent.
- **Typography scale** — Hierarchy from display through body (e.g. H1–H6 + body conventions).
- **Logo usage** — Clear space, backgrounds, forbidden treatments.
- **Tone of voice** — How the brand should sound in copy.
- **CSS variables** — Ready-to-copy tokens for engineering handoff (see exports below).

---

## Export options

The Design Canvas **Export** experience is designed to support:

| Format | Typical use |
| --- | --- |
| **PNG** | Raster previews and a **PNG package** (multiple assets) for slide decks and quick sharing; may include browser-side rendering from SVG where applicable. |
| **SVG** | Editable **vector** logo files (primary and icon/monogram). |
| **CSS variables** | Copy **design tokens** (`--color-*`, `--font-*`, etc.) into a codebase or design system starter. |
| **PDF** | **Brand guidelines** as a portable document (generation may be server-assisted per product implementation). |

Exact bundling (zip vs single files) follows the shipped UI and backend in each release; see [design_agent_spec.md](./design_agent_spec.md) for implementation notes.

---

## Subscription tier

**Design Agent** is gated to **Business** and **Enterprise** tiers only — **not** Free or Pro. Enforcement is aligned with [Tunde Hub](../06_tunde_hub/overview.md) / product feature flags as billing matures.

| Tier | Access |
| --- | :---: |
| Free | No |
| Pro | No |
| Business | Yes |
| Enterprise | Yes |

---

## Future phases

Beyond **Phase 1 — Brand Identity**, the roadmap envisions additional design capabilities (see [design_agent_spec.md](./design_agent_spec.md) §12 for the master list), including:

| Phase | Direction |
| --- | --- |
| **2** | Web page designer |
| **3** | UI/UX prototype layouts (including evolution of “generate image” style flows) |
| **4** | 3D architecture visualizer |
| **5** | Social media kit (templates for Instagram, LinkedIn, X/Twitter, etc.) |

Details and delivery order may change with product prioritization; the spec file remains the engineering source of truth.

---

## See also

- [Tools overview](./overview.md) — where Design Agent sits in the full tools map.
- [Design Agent architecture & spec](./design_agent_spec.md) — API shapes, canvas tabs, DB, and build checklist.
