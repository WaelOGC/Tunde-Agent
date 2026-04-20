# Design Agent — Architecture & Spec (Phase 1: Brand Identity)

**Version:** 1.0  
**Date:** 2026-04-20  
**Status:** Ready for Development  
**Phase:** 1 — Brand Identity  

---

## 1. Overview

Design Agent is a full-stack AI-powered brand identity generator built into the Tunde workspace. It takes a user's business description and produces a complete, professional brand identity package — including color palette, typography, logo concept (SVG), and a full Brand Guidelines document — all rendered in a dedicated Design Canvas.

### What makes it unique
- **Context-aware branding** — understands industry, audience, and tone
- **Complete brand package in one step** — not just a logo or just colors
- **Design Canvas** — a new dedicated canvas unlike any existing canvas in the app
- **Full export suite** — PNG/JPG, SVG, CSS Variables, PDF

---

## 2. User Flow (Wizard — 4 Steps)

```
Step 1 → Business Info
  - Brand/Company name
  - Industry (dropdown: Tech, Food, Fashion, Health, Finance, Education, Other)
  - One-line description

Step 2 → Audience & Tone
  - Target audience (e.g. "young professionals", "luxury buyers")
  - Tone (grid selection):
      Minimal | Bold | Elegant | Playful
      Corporate | Futuristic | Natural | Retro

Step 3 → Style Preferences
  - Color mood (grid):
      Dark & Dramatic | Light & Clean
      Warm & Earthy | Cool & Professional
      Vibrant & Energetic | Pastel & Soft
  - Logo style (grid):
      Wordmark | Lettermark | Abstract | Geometric

Step 4 → Confirm & Generate
  - Summary of all choices
  - "Generate Brand Identity" button
  - Estimated time: ~15 seconds
```

---

## 3. Brand Identity Output

The AI generates a complete brand package with these components:

### 3.1 Color Palette
```json
{
  "palette": [
    { "name": "Primary",   "hex": "#1A1A2E", "usage": "Main brand color" },
    { "name": "Secondary", "hex": "#16213E", "usage": "Backgrounds" },
    { "name": "Accent",    "hex": "#0F3460", "usage": "CTAs, highlights" },
    { "name": "Light",     "hex": "#E94560", "usage": "Text on dark" },
    { "name": "Neutral",   "hex": "#F5F5F5", "usage": "White space" }
  ]
}
```

### 3.2 Typography
```json
{
  "typography": {
    "heading": {
      "font": "Playfair Display",
      "weight": "700",
      "usage": "Headlines, hero text"
    },
    "body": {
      "font": "Inter",
      "weight": "400",
      "usage": "Body text, descriptions"
    },
    "accent": {
      "font": "Space Mono",
      "weight": "400",
      "usage": "Labels, captions, code"
    }
  }
}
```

### 3.3 Logo Concept (SVG)
- AI generates an SVG logo based on brand name + style preference
- Delivered as raw SVG string (editable, scalable)
- Includes: primary version + monogram/icon version

### 3.4 Brand Guidelines
Full structured document including:
- Brand story (2-3 sentences)
- Color usage rules (do's and don'ts)
- Typography scale (H1–H6 + body)
- Logo usage rules (spacing, backgrounds, forbidden uses)
- Tone of voice guidelines
- CSS Variables ready to copy

---

## 4. Design Canvas (New — Dedicated)

A brand-new canvas unlike any existing canvas in the app.

### Tabs
```
Overview | Colors | Typography | Logo | Guidelines | Export
```

### Tab Details

**Overview**
- Brand name + tagline
- Quick preview of all elements together
- "Regenerate" button

**Colors**
- 5 color swatches (large, clickable)
- Click → copies HEX to clipboard
- Shows: HEX, RGB, HSL values
- Color usage description per swatch

**Typography**
- Live font preview with brand name
- Font name + weight + Google Fonts link
- Scale preview (H1 → Body → Caption)

**Logo**
- SVG logo rendered large
- Toggle: Dark background / Light background
- Download buttons: SVG, PNG

**Guidelines**
- Full Brand Guidelines document
- Styled like a real brand book
- Sections: Story, Colors, Typography, Logo, Voice

**Export**
- PNG Package (all assets zipped)
- SVG Files (logo + icon)
- CSS Variables (copy to clipboard)
- PDF Brand Book (generated via backend)

---

## 5. Backend Architecture

### New Files to Create

```
tunde_webapp_backend/app/
├── design_router.py              ← New router
└── tools/
    └── design_agent.py           ← New tool
```

### Endpoints

```
POST /tools/design/brand-identity
  Request: {
    brand_name, industry, description,
    audience, tone, color_mood, logo_style,
    user_id?, session_id?
  }
  Response: BrandIdentityResponse (see §5.2)

GET /db/design-brands?user_id=...
GET /db/design-brands/{brand_id}
```

### Response Shape
```json
{
  "brand_id": "uuid",
  "brand_name": "SentinelAI",
  "tagline": "Security made simple.",
  "palette": [...],
  "typography": {...},
  "logo_svg": "<svg>...</svg>",
  "logo_icon_svg": "<svg>...</svg>",
  "guidelines": {
    "brand_story": "...",
    "color_rules": [...],
    "typography_scale": [...],
    "logo_rules": [...],
    "tone_of_voice": [...]
  },
  "css_variables": "--color-primary: #1A1A2E;\n--font-heading: 'Playfair Display';",
  "provider": "gemini",
  "created_at": "2026-04-20T..."
}
```

### AI Provider
- **Current:** Gemini (generates SVG + JSON in one pass)
- **Future:** Leonardo.ai (image logos), Recraft.ai (vector logos)
- **Routing:** `DEFAULT_IMAGE_PROVIDER` from `.env`

---

## 6. Database

### New Table: `brand_identities`

```python
class BrandIdentity:
    brand_id          # UUID PK
    user_id           # String (indexed)
    session_id        # UUID (indexed, nullable)
    conv_id           # UUID FK → conversations
    message_id        # String
    brand_name        # String
    industry          # String
    description       # Text
    audience          # String
    tone              # String
    color_mood        # String
    logo_style        # String
    payload_json      # Text ← full BrandIdentityResponse
    provider          # String default="gemini"
    created_at        # DateTime
    updated_at        # DateTime
```

---

## 7. Frontend Architecture

### New Files to Create

```
tunde_webapp_frontend/src/
├── components/
│   ├── DesignAgentCanvas.jsx      ← New dedicated canvas
│   └── BrandIdentityWizard.jsx    ← New wizard (4 steps)
└── constants/
    └── designAgentWorkflow.js     ← Wizard steps + options
```

### Files to Update (additive only)

```
App.jsx           ← add design wizard state + submit handler
ChatCenter.jsx    ← add design_solution block renderer
WorkspaceSidebar.jsx ← add Design Agent tool entry
```

### Chat Block: `design_solution`
```jsx
// Rendered in ChatCenter.jsx
<DesignSolutionBlock
  block={block}              // brand identity data
  onOpenCanvas={...}         // opens DesignAgentCanvas
  messageId={messageId}
/>
```

### Canvas Design (Dark Glassmorphism — "Year 2100")
```css
/* Matches Tunde design system */
background: #0a0f1a;
border: 1px solid rgba(255,255,255,0.08);
backdrop-filter: blur(20px);

/* Accent color for Design Agent */
--design-accent: #a855f7;  /* purple-500 */
--design-accent-2: #ec4899; /* pink-500 — for gradients */
```

---

## 8. Tool Color Theme

Following Tunde's tool color convention:

| Property | Value |
|----------|-------|
| Badge color | Purple / Pink gradient |
| Icon | 🎨 |
| Tool ID | `design_agent` |
| Label | `Design Agent` |
| Hint | `Brand identity, colors, typography, logo & guidelines` |

---

## 9. Export Implementation

| Format | Method |
|--------|--------|
| SVG | Serve raw SVG string from `payload_json.logo_svg` |
| PNG | Canvas API: render SVG → PNG via browser |
| CSS Variables | Copy `payload_json.css_variables` to clipboard |
| PDF | Backend: `fpdf2` renders Brand Guidelines as PDF |

---

## 10. Subscription Tier

| Tier | Access |
|------|--------|
| Free | ❌ |
| Pro | ❌ |
| Business | ✅ |
| Enterprise | ✅ |

---

## 11. Development Checklist

### Part 1 — Documentation
- [x] Create `docs/08_tools/design_agent.md`
- [x] Update `docs/08_tools/overview.md`
- [x] Update `Tunde_Agent_Reference_Document.md`
- [x] Update `PROJECT_CONTEXT.md`

### Part 2 — Backend
- [ ] Create `tunde_webapp_backend/app/tools/design_agent.py`
- [ ] Create `tunde_webapp_backend/app/design_router.py`
- [ ] Update `task_models.py` (Request + Response models)
- [ ] Update `main.py` (register design_router)

### Part 3 — Database
- [ ] Create `tunde_webapp_backend/app/models/brand_identity.py`
- [ ] Update `db.py` init_db()
- [ ] Update `db_router.py` (GET endpoints)

### Part 4 — Frontend
- [ ] Create `BrandIdentityWizard.jsx`
- [ ] Create `DesignAgentCanvas.jsx`
- [ ] Create `designAgentWorkflow.js`
- [ ] Update `ChatCenter.jsx` (design_solution block)
- [ ] Update `App.jsx` (wizard state + submit handler)

### Part 5 — Commit
- [ ] All files committed together as one bundle
- [ ] Update docs after QA

---

## 12. Future Phases

| Phase | Feature |
|-------|---------|
| 2 | Web Page Designer |
| 3 | UI/UX Prototype Layout (migrated from Generate Image) |
| 4 | 3D Architecture Visualizer |
| 5 | Social Media Kit (Instagram, LinkedIn, Twitter templates) |
