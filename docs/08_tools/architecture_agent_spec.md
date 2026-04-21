# 3D Architecture Visualizer — Spec (Phase 4)

**Last Updated:** 2026-04-21  
**Status:** Phase 4 Partial — Core features complete.  
3D View deferred to future release.  
Sustainability + Materials + Assessment + Export: ✅ Live  

**Version:** 1.0  
**Date:** 2026-04-21  
**Phase:** 4 — 3D Architecture Visualizer (Design Agent roadmap)  

---

## 1. Overview

The **3D Architecture Visualizer** is an AI-powered architectural visualization tool for **architects** and **architecture students**. It generates **interactive 3D building models** with **sustainability analysis**, **material simulation**, and **professional exports**.

**Target users:** Architecture students and professional architects.

**Roadmap position:** Phase **4** of the Design Agent family (see [Design Agent architecture & spec](./design_agent_spec.md) §12).

**Subscription tier:** **Business** and **Enterprise** only — not Free or Pro.

**Intent:** Early-stage design exploration and presentation — not a substitute for licensed structural engineering, code compliance review, or construction documentation.

---

## 2. User Flow (Wizard — 4 Steps)

### Step 1 — Building Info

- **Building type** (dropdown):  
  Villa | Apartment | Office | Hotel | School | Hospital | Retail | Other  
- **Project name**  
- **Description** (detailed free text)  
- **Location / climate** (dropdown):  
  Hot & Dry | Hot & Humid | Mediterranean | Temperate | Cold | Tropical  

### Step 2 — Dimensions & Layout

- **Total area** (m²)  
- **Number of floors**  
- **Floor height** (meters)  
- **Rooms / spaces** (multi-select):  
  Living Room | Bedroom | Kitchen | Bathroom | Office | Hall | Garage | Garden | Pool | Lobby | Conference Room | Other  
- **Special requirements** (free text)  

### Step 3 — Architectural Style & Materials

- **Style** (grid selection):  
  Modern | Minimalist | Classical | Contemporary | Industrial | Mediterranean | Sustainable | Futuristic  
- **Primary structure** (single select):  
  Reinforced Concrete | Steel Frame | Cross-Laminated Timber | Masonry | Mixed  
- **Facade material** (single select):  
  Glass | Concrete | Wood | Stone | Brick | Metal Panels | Green Wall  
- **Roof type** (single select):  
  Flat | Pitched | Green Roof | Solar Panels | Dome | Mixed  

### Step 4 — Confirm & Generate

- Full **summary** of all wizard inputs  
- Primary action: **Generate**  
- **Estimated generation time:** ~30 seconds (UX hint; actual duration depends on provider and load)  

---

## 3. Output

### 3.1 3D Model (Three.js)

- **Interactive canvas:** rotate 360°, zoom, pan  
- **Materials:** realistic appearance with textures where supported  
- **Lighting modes:** Day / Night / Sunset  
- **Sun position simulation:** morning / noon / evening (or continuous time-of-day control)  
- **Shadow rendering** where performance allows  
- **View toggle:** Interior / Exterior  

### 3.2 Sustainability Analysis

- **Carbon footprint** score per material (aggregated and per line item where applicable)  
- **Energy efficiency** rating (**A–F** scale)  
- **Natural light** analysis — window placement score  
- **Climate suitability** rating vs selected location/climate  
- **Overall sustainability score** (**A–F**)  
- **Recommendations** for improvement (actionable bullets)  

### 3.3 Materials Report

- List of **all materials** with **quantities** (m²)  
- **Estimated cost range** per material (industry-average bands, not quotes)  
- **CO₂ emissions** per material (tons, estimated)  
- **Eco-friendly alternative** suggestions per material where relevant  

### 3.4 Disaster Resistance Assessment

- **Mandatory disclaimer:** *Indicative only — consult a licensed structural engineer.*  
- **Earthquake** resistance indication (informed primarily by structure type; not a code study)  
- **Wind** resistance rating (qualitative / banded)  
- **Flood risk** considerations (tied to climate + general guidance)  
- **Recommendations** (non-binding design hints)  

### 3.5 Export Options

| Format | Typical use |
|--------|-------------|
| **GLTF / GLB** | Blender, Unity, Unreal, web viewers |
| **OBJ** | AutoCAD, SketchUp, general CAD pipelines |
| **PNG renders** | Four fixed angles: front, side, back, aerial |
| **PDF report** | Sustainability + materials + assessment narrative |

Exact bundling (single download vs zip) is an implementation detail; the product should prefer **one obvious export path** per format.

---

## 4. Backend Architecture

### 4.1 New Files

```
tunde_webapp_backend/app/tools/architecture_agent.py
tunde_webapp_backend/app/architecture_router.py
tunde_webapp_backend/app/models/architecture_project.py
```

### 4.2 Endpoint

```
POST /tools/architecture/generate
```

**Request (conceptual):**

```json
{
  "project_name": "string",
  "building_type": "string",
  "description": "string",
  "location_climate": "string",
  "total_area": 0.0,
  "floors": 0,
  "floor_height": 0.0,
  "rooms": ["Living Room", "Kitchen"],
  "special_requirements": "string (optional)",
  "style": "string",
  "structure_type": "string",
  "facade_material": "string",
  "roof_type": "string",
  "user_id": "string (optional)",
  "session_id": "uuid (optional)"
}
```

**Response:** `ArchitectureProjectResponse`

```json
{
  "project_id": "uuid",
  "project_name": "string",
  "building_type": "string",
  "threejs_code": "// complete Three.js scene setup as executable module string",
  "sustainability": {
    "carbon_score": 0,
    "energy_rating": "A",
    "light_score": 0,
    "climate_rating": "string",
    "overall_grade": "B",
    "recommendations": ["..."]
  },
  "materials_report": {
    "items": [
      {
        "name": "string",
        "quantity_m2": 0.0,
        "cost_range": "string",
        "co2_tons": 0.0,
        "eco_alternative": "string"
      }
    ]
  },
  "disaster_assessment": {
    "earthquake_rating": "string",
    "wind_rating": "string",
    "flood_considerations": "string",
    "recommendations": ["..."],
    "disclaimer": "Indicative only — consult a licensed structural engineer."
  },
  "export_ready": true,
  "created_at": "2026-04-21T12:00:00Z"
}
```

Field names may be aligned with existing `task_models.py` conventions (camelCase vs snake_case) at implementation time; this spec describes **semantic** contracts.

### 4.3 AI Provider

- **Primary:** **Gemini** — single structured pass producing **Three.js scene code** plus **JSON** for sustainability, materials, and disaster assessment blocks.  
- **Routing:** Follow existing env patterns (e.g. `DEFAULT_LLM_PROVIDER` / tool-specific overrides) consistent with other Design Agent family tools.  
- **Provider labels:** Must **not** be shown in end-user UI (product rule: provider names hidden from users).

---

## 5. Database

### Table: `architecture_projects`

| Column | Type | Notes |
|--------|------|--------|
| `project_id` | UUID | Primary key |
| `user_id` | String | Indexed |
| `session_id` | UUID | Nullable, indexed |
| `project_name` | String | |
| `building_type` | String | |
| `description` | Text | |
| `location_climate` | String | |
| `total_area` | Float | m² |
| `floors` | Integer | |
| `floor_height` | Float | meters (optional in UI validation rules TBD) |
| `rooms_json` | Text | Serialized list of selected rooms |
| `special_requirements` | Text | Nullable |
| `style` | String | |
| `structure_type` | String | |
| `facade_material` | String | |
| `roof_type` | String | |
| `threejs_code` | Text | Full scene code string |
| `sustainability_json` | Text | Sustainability block |
| `materials_json` | Text | Materials report |
| `disaster_json` | Text | Assessment + disclaimer |
| `created_at` | DateTime | |
| `updated_at` | DateTime | |

**Note:** Alternatively, a single `payload_json` column (like other tools) may store the full response; this table layout can be normalized vs denormalized per engineering preference — the spec requires **recoverability** of wizard inputs + generated artifacts for list/detail APIs.

---

## 6. Frontend Architecture

### 6.1 New Files

```
tunde_webapp_frontend/src/components/ArchitectureWizard.jsx
tunde_webapp_frontend/src/components/ArchitectureCanvas.jsx
tunde_webapp_frontend/src/constants/architectureWorkflow.js
```

### 6.2 Canvas Tabs

```
3D View | Sustainability | Materials | Assessment | Export
```

### 6.3 Tab Details

**3D View**

- Three.js canvas (full interactive viewport)  
- Controls: rotate, zoom, pan  
- Lighting toggle: **Day** / **Sunset** / **Night**  
- Sun simulation: slider or presets (morning / noon / evening)  
- View toggle: **Exterior** / **Interior**  

**Sustainability**

- Large **overall grade** card (**A–F**)  
- Four **metric bars:** Carbon | Energy | Light | Climate  
- **Recommendations** list with eco tips  

**Materials**

- Table columns: **Material** | **Quantity** | **Cost** | **CO₂** | **Eco Alt**  
- **Total cost** estimate (range)  
- **Total CO₂** estimate  
- Optional CTA: **“Switch to eco materials”** — re-runs or applies heuristic suggestions (implementation TBD; must not imply certified LCA)  

**Assessment**

- **Prominent disclaimer banner** — structural engineer required for real projects  
- Earthquake | Wind | Flood — **visual** ratings (icons, bands, or gauges)  
- Recommendations list  

**Export**

- Download **GLTF / GLB**  
- Download **OBJ**  
- Download **PNG** pack (4 views)  
- Download **PDF** report  

**Security / CSP:** If the 3D view executes model-generated code, the implementation must follow the same rigor as other “generated executable preview” features (sandboxing, CSP, or server-side render strategies). Defer to engineering review before shipping.

---

## 7. Tool Identity

| Property | Value |
|----------|--------|
| **Icon** | 🏛️ |
| **Label** | Architecture Visualizer |
| **Hint** | 3D models, sustainability & materials analysis |
| **Badge** | Business |
| **Tool ID** | `architecture_agent` |
| **Color** | Amber / Orange gradient (Design family sub-tool) |

---

## 8. Subscription Tier

| Tier | Access |
|------|:------:|
| Free | ❌ |
| Pro | ❌ |
| Business | ✅ |
| Enterprise | ✅ |

---

## 9. Important Notes

- **Disaster / structural assessments** must always ship with the **mandatory disclaimer:** results are **indicative only** for early-stage design — **always consult a licensed structural engineer** for compliance and safety.  
- **Carbon** and **cost** figures are **estimates** based on **industry averages** — not audited life-cycle assessments or contractor quotes.  
- The tool supports **early-stage exploration** and **communication** — **not** final engineering documentation or permit submissions.  
- **Natural light** and **energy** scores are heuristic; they do not replace daylight simulation software or energy modeling required by jurisdiction.  

---

## 10. Development Checklist

### Part 1 — Documentation

- [x] Create `docs/08_tools/architecture_agent_spec.md`  
- [ ] Update `docs/08_tools/overview.md`  
- [ ] Update `Tunde_Agent_Reference_Document.md`  
- [ ] Update `PROJECT_CONTEXT.md`  

### Part 2 — Backend

- [x] Create `tunde_webapp_backend/app/tools/architecture_agent.py`  
- [x] Create `tunde_webapp_backend/app/architecture_router.py`  
- [x] Update `task_models.py` (request/response models)  
- [x] Update `main.py` (router registration)  
- [x] Integrate fal.ai Hyper3D Rodin (`glb_url` field)  

### Part 3 — Database

- [x] Create `tunde_webapp_backend/app/models/architecture_project.py`  
- [x] Update `db.py` `init_db()`  
- [x] Update `db_router.py` (list/get endpoints as needed)  

### Part 4 — Frontend

- [x] Create `ArchitectureWizard.jsx` (4-step wizard)  
- [x] Create `ArchitectureCanvas.jsx`  
- [x] Create `architectureWorkflow.js`  
- [x] Update `ChatCenter.jsx` (`architecture_solution` block)  
- [x] Update `App.jsx` (wizard state + submit handler)  
- [x] Update `ToolPickerModal.jsx` (tool entry under Design family)  
- [ ] 3D View — deferred (Coming Soon)  
- [ ] GLTF/OBJ export — deferred  
- [ ] Lighting controls — deferred with 3D View  

### Part 5 — Commit

- [ ] All files committed as one coherent bundle  
- [ ] QA complete (3D perf, exports, disclaimers, tier gating)  

---

## 11. Future Enhancements

- **Climate API** integration — real local weather / degree-day hints  
- **OpenBIM / IFC** export for Revit / ArchiCAD pipelines  
- **Structural load calculator** — only with vetted engineering APIs and explicit scope limits  
- **Regional material pricing** database (supplier-agnostic aggregates)  
- **Collaboration** — share project link with team (permissions + audit)  
- **Version history** — compare design iterations side-by-side  

---

## See also

- [Design Agent — user guide](./design_agent.md)  
- [Design Agent — architecture & spec](./design_agent_spec.md) — roadmap table §12  
- [Tools overview](./overview.md)  
