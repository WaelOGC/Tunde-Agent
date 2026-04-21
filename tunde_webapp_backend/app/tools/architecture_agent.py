"""
3D Architecture Visualizer — Design Agent Phase 4
AI provider: Gemini (Three.js scene code + JSON analysis in one pass)
"""

import asyncio
import json
import os
import re
from datetime import datetime, timezone

from tunde_agent.config.settings import get_settings

# ── Gemini setup ─────────────────────────────────────────────────────────────

settings     = get_settings()
GEMINI_API_KEY = settings.gemini_api_key or os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = getattr(settings, "gemini_model", "gemini-2.5-flash")

FAL_API_KEY = os.getenv("FAL_API_KEY", "")


async def generate_3d_model_fal(req: dict) -> str:
    """
    Generate a GLB 3D model using Hyper3D Rodin via fal.ai.
    Returns the GLB file URL or empty string on failure.
    """
    import fal_client

    if not FAL_API_KEY:
        print("[architecture_agent] FAL_API_KEY not set")
        return ""

    try:
        os.environ["FAL_KEY"] = FAL_API_KEY

        prompt = (
            f"A {req.get('style', 'modern')} {req.get('building_type', 'villa')} "
            f"with {req.get('facade_material', 'concrete')} facade, "
            f"{req.get('roof_type', 'flat')} roof, "
            f"{req.get('floors', 2)} floors, "
            f"architectural visualization, "
            f"professional 3D model, detailed exterior"
        )

        result = await asyncio.to_thread(
            fal_client.run,
            "fal-ai/hyper3d/rodin",
            arguments={
                "prompt": prompt,
                "geometry_file_format": "glb",
                "material": "PBR",
                "quality": "medium",
                "tier": "Regular",
            },
        )

        if result and isinstance(result, dict) and "model_mesh" in result:
            mesh = result["model_mesh"]
            if isinstance(mesh, dict):
                return mesh.get("url", "") or ""
        return ""

    except Exception as exc:
        print(f"[architecture_agent] fal.ai error: {exc}")
        return ""

# ── Carbon & cost reference data ─────────────────────────────────────────────

MATERIAL_DATA = {
    "Reinforced Concrete": {"co2_per_m2": 0.35, "cost_range": "$80–$150/m²",  "eco_alt": "Cross-Laminated Timber"},
    "Steel Frame":         {"co2_per_m2": 0.55, "cost_range": "$120–$220/m²", "eco_alt": "Recycled Steel Frame"},
    "Cross-Laminated Timber": {"co2_per_m2": -0.20, "cost_range": "$90–$170/m²", "eco_alt": "Already eco-friendly"},
    "Masonry":             {"co2_per_m2": 0.25, "cost_range": "$60–$130/m²",  "eco_alt": "Rammed Earth"},
    "Mixed":               {"co2_per_m2": 0.30, "cost_range": "$90–$180/m²",  "eco_alt": "Timber-Concrete Composite"},
    "Glass":               {"co2_per_m2": 0.45, "cost_range": "$150–$400/m²", "eco_alt": "Double-glazed Low-E Glass"},
    "Concrete":            {"co2_per_m2": 0.35, "cost_range": "$70–$140/m²",  "eco_alt": "Recycled Aggregate Concrete"},
    "Wood":                {"co2_per_m2": -0.15, "cost_range": "$80–$200/m²", "eco_alt": "FSC-certified Wood"},
    "Stone":               {"co2_per_m2": 0.15, "cost_range": "$100–$300/m²", "eco_alt": "Local Stone (reduces transport)"},
    "Brick":               {"co2_per_m2": 0.22, "cost_range": "$60–$120/m²",  "eco_alt": "Reclaimed Brick"},
    "Metal Panels":        {"co2_per_m2": 0.40, "cost_range": "$120–$250/m²", "eco_alt": "Recycled Aluminum Panels"},
    "Green Wall":          {"co2_per_m2": -0.10, "cost_range": "$200–$500/m²","eco_alt": "Already eco-friendly"},
    "Green Roof":          {"co2_per_m2": -0.08, "cost_range": "$150–$350/m²","eco_alt": "Already eco-friendly"},
    "Solar Panels":        {"co2_per_m2": -0.30, "cost_range": "$200–$500/m²","eco_alt": "Already eco-friendly"},
}

# ── System prompt ─────────────────────────────────────────────────────────────

ARCHITECTURE_SYSTEM_PROMPT = """
You are an expert architectural AI that generates both Three.js 3D scene code
AND a structured JSON analysis for building projects.

Return ONLY a valid JSON object — no markdown fences, no prose, no preamble.
The JSON must have exactly this structure:

{
  "threejs_code": "// Complete Three.js scene as a self-contained JS string...",
  "sustainability": {
    "carbon_score": 75,
    "energy_rating": "B",
    "light_score": 80,
    "climate_rating": "Good",
    "overall_grade": "B+",
    "recommendations": [
      "Add solar panels to reduce energy consumption by 30%",
      "Use double-glazed windows for better insulation"
    ]
  },
  "materials_report": {
    "items": [
      {
        "name": "Reinforced Concrete",
        "quantity_m2": 450.0,
        "cost_range": "$80–$150/m²",
        "co2_tons": 157.5,
        "eco_alternative": "Cross-Laminated Timber"
      }
    ]
  },
  "disaster_assessment": {
    "earthquake_rating": "Moderate",
    "wind_rating": "Good",
    "flood_considerations": "Elevated foundation recommended for flood-prone areas",
    "recommendations": [
      "Add shear walls for earthquake resistance",
      "Install storm shutters for high-wind protection"
    ],
    "disclaimer": "Indicative only — consult a licensed structural engineer for real projects."
  }
}

THREE.JS CODE RULES:
- Write complete, self-contained JavaScript
- Use Three.js r128 global (THREE is available)
- Create a scene with:
  * Realistic building geometry matching the inputs
  * Proper materials with colors matching style/facade
  * Directional sun light + ambient light — MUST use variable names exactly `sunLight` (THREE.DirectionalLight)
    and `ambientLight` (THREE.AmbientLight) so the UI can adjust lighting at runtime
  * Ground plane
  * Basic shadows — set renderer.shadowMap.enabled = true
  * OrbitControls NOT available — use mouse events instead
  * Camera positioned to show full building
- Building must reflect:
  * Number of floors (each ~3m height)
  * Building type and style
  * Facade material (color/appearance)
  * Roof type
  * Windows and doors as geometry
- Export the scene so it can be rendered in a canvas
- The code must work when executed with eval() in a browser
- Start with: const scene = new THREE.Scene();
- End with: return { scene, camera, renderer, sunLight, ambientLight, animate, onMouseDown, onMouseUp, onMouseMove };

SCENE DETAILS — Always include ALL of these:
- Ground: green grass plane (200x200)
- Sky: light blue background color
- Trees: at least 4 trees around the building
  (cone shape for leaves + cylinder for trunk)
- Garden path: a walkway from the street to the door
  (flat box geometry, light gray color)
- Surrounding environment: simple fence or hedges
- If pool requested: add a blue rectangle near building
- If garden requested: add flower beds (small colored boxes)
- Shadows: enable shadowMap on renderer
- The building must have visible windows (glass material)
  and a main door
- Camera: positioned to show the full building nicely
  from a 45 degree angle

SUSTAINABILITY RULES:
- carbon_score: 0-100 (higher = less carbon)
- energy_rating: A (best) to F (worst)
- light_score: 0-100 (natural light quality)
- overall_grade: A+, A, B+, B, C+, C, D, F
- Base scores on: climate, structure_type, facade, roof, orientation

DISASTER ASSESSMENT:
- earthquake_rating: Excellent/Good/Moderate/Poor
- wind_rating: Excellent/Good/Moderate/Poor
- Base on structure_type and location_climate
- Always include the disclaimer

Return ONLY the JSON. Nothing else.
"""


def _build_user_prompt(req: dict) -> str:
    rooms = ", ".join(req.get("rooms", ["Living Room", "Bedroom"]))
    return f"""Generate a 3D architecture visualization for:

Project name: {req["project_name"]}
Building type: {req["building_type"]}
Description: {req["description"]}
Location/Climate: {req["location_climate"]}
Total area: {req["total_area"]} m²
Number of floors: {req["floors"]}
Floor height: {req.get("floor_height", 3)} meters
Rooms/spaces: {rooms}
Special requirements: {req.get("special_requirements", "None")}
Architectural style: {req["style"]}
Primary structure: {req["structure_type"]}
Facade material: {req["facade_material"]}
Roof type: {req["roof_type"]}

Generate the complete Three.js scene code and full JSON analysis now."""


def _calculate_materials(req: dict, total_area: float) -> dict:
    """Calculate materials report based on inputs."""
    floors     = req.get("floors", 1)
    facade_mat = req.get("facade_material", "Concrete")
    struct_mat = req.get("structure_type", "Reinforced Concrete")
    roof_mat   = req.get("roof_type", "Flat")

    facade_area = (total_area ** 0.5) * 4 * floors * req.get("floor_height", 3)
    roof_area   = total_area

    items = []

    # Structure
    struct_data = MATERIAL_DATA.get(struct_mat, MATERIAL_DATA["Reinforced Concrete"])
    items.append({
        "name":         struct_mat,
        "quantity_m2":  round(total_area * floors * 0.15, 1),
        "cost_range":   struct_data["cost_range"],
        "co2_tons":     round(total_area * floors * 0.15 * struct_data["co2_per_m2"], 2),
        "eco_alternative": struct_data["eco_alt"],
    })

    # Facade
    facade_data = MATERIAL_DATA.get(facade_mat, MATERIAL_DATA["Concrete"])
    items.append({
        "name":         facade_mat,
        "quantity_m2":  round(facade_area, 1),
        "cost_range":   facade_data["cost_range"],
        "co2_tons":     round(facade_area * facade_data["co2_per_m2"], 2),
        "eco_alternative": facade_data["eco_alt"],
    })

    # Roof
    roof_key  = "Green Roof" if "Green" in roof_mat else ("Solar Panels" if "Solar" in roof_mat else "Reinforced Concrete")
    roof_data = MATERIAL_DATA.get(roof_key, MATERIAL_DATA["Reinforced Concrete"])
    items.append({
        "name":         roof_mat,
        "quantity_m2":  round(roof_area, 1),
        "cost_range":   roof_data["cost_range"],
        "co2_tons":     round(roof_area * roof_data["co2_per_m2"], 2),
        "eco_alternative": roof_data["eco_alt"],
    })

    return {"items": items}


def _default_response(req: dict) -> dict:
    """Safe fallback when Gemini fails."""
    total_area = req.get("total_area", 200)
    floors     = req.get("floors", 2)
    style      = req.get("style", "Modern")
    facade     = req.get("facade_material", "Concrete")

    color_map = {
        "Glass": "0x87CEEB", "Concrete": "0x808080", "Wood": "0x8B4513",
        "Stone": "0x708090", "Brick": "0xB22222", "Metal Panels": "0xC0C0C0",
        "Green Wall": "0x228B22",
    }
    facade_color = color_map.get(facade, "0x909090")
    building_h   = floors * 3
    width        = (total_area ** 0.5)
    depth        = width

    threejs_code = f"""
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set({width * 1.5}, {building_h * 1.2}, {depth * 2});
camera.lookAt(0, {building_h / 2}, 0);

const renderer = new THREE.WebGLRenderer({{ antialias: true }});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.2);
sunLight.position.set(50, 80, 50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

const groundGeo = new THREE.PlaneGeometry(200, 200);
const groundMat = new THREE.MeshLambertMaterial({{ color: 0x4a7c59 }});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const buildingGeo = new THREE.BoxGeometry({width}, {building_h}, {depth});
const buildingMat = new THREE.MeshLambertMaterial({{ color: {facade_color} }});
const building = new THREE.Mesh(buildingGeo, buildingMat);
building.position.y = {building_h / 2};
building.castShadow = true;
building.receiveShadow = true;
scene.add(building);

for (let f = 0; f < {floors}; f++) {{
  const floorY = f * 3 + 1.5;
  for (let w = -1; w <= 1; w++) {{
    const winGeo = new THREE.BoxGeometry(1.2, 1.5, 0.1);
    const winMat = new THREE.MeshLambertMaterial({{ color: 0xADD8E6, transparent: true, opacity: 0.7 }});
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(w * ({width} / 3), floorY, {depth / 2} + 0.1);
    scene.add(win);
  }}
}}

const doorGeo = new THREE.BoxGeometry(1.5, 2.5, 0.1);
const doorMat = new THREE.MeshLambertMaterial({{ color: 0x4A3728 }});
const door = new THREE.Mesh(doorGeo, doorMat);
door.position.set(0, 1.25, {depth / 2} + 0.1);
scene.add(door);

let mouseX = 0, mouseY = 0, isDragging = false;
const onMouseDown = () => isDragging = true;
const onMouseUp = () => isDragging = false;
const onMouseMove = (e) => {{
  if (!isDragging) return;
  building.rotation.y += (e.clientX - mouseX) * 0.01;
  mouseX = e.clientX; mouseY = e.clientY;
}};

const animate = () => {{
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}};

return {{ scene, camera, renderer, animate, onMouseDown, onMouseUp, onMouseMove }};
"""

    return {
        "threejs_code": threejs_code,
        "sustainability": {
            "carbon_score":   65,
            "energy_rating":  "C",
            "light_score":    70,
            "climate_rating": "Moderate",
            "overall_grade":  "C+",
            "recommendations": [
                "Add solar panels to roof for renewable energy",
                "Use double-glazed windows for better insulation",
                "Consider green wall for improved air quality",
            ],
        },
        "materials_report": _calculate_materials(req, total_area),
        "disaster_assessment": {
            "earthquake_rating":    "Moderate",
            "wind_rating":          "Good",
            "flood_considerations": "Consider elevated foundation in flood-prone areas",
            "recommendations": [
                "Add shear walls for improved earthquake resistance",
                "Ensure proper drainage around the foundation",
            ],
            "disclaimer": "Indicative only — consult a licensed structural engineer for real projects.",
        },
    }


def _clean_json(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


def _gemini_generate_sync(req: dict) -> str:
    from google import genai
    from google.genai import types

    client   = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=_build_user_prompt(req),
        config=types.GenerateContentConfig(
            system_instruction=ARCHITECTURE_SYSTEM_PROMPT,
            temperature=0.7,
            max_output_tokens=8192,
        ),
    )
    return response.text or ""


async def generate_architecture_project(req: dict) -> dict:
    """
    Core entrypoint called by architecture_router.py.
    Returns dict with threejs_code, sustainability, materials_report,
    disaster_assessment, provider.
    """
    if not GEMINI_API_KEY:
        print("[architecture_agent] Gemini skipped: no GEMINI_API_KEY")
        result = _default_response(req)
        result["provider"] = "fallback"
        result["glb_url"] = ""
        return result

    try:
        raw     = await asyncio.to_thread(_gemini_generate_sync, req)
        cleaned = _clean_json(raw)

        # Deduplicate if Gemini returns multiple JSON objects
        lower   = cleaned.lower()
        first   = lower.find("{")
        if first > 0:
            cleaned = cleaned[first:]

        data = json.loads(cleaned)

        # Ensure required keys exist
        default = _default_response(req)
        for key in default:
            if key not in data:
                data[key] = default[key]

        # Always override materials_report with calculated values
        # to ensure accuracy (Gemini estimates can be unreliable)
        data["materials_report"] = _calculate_materials(
            req, req.get("total_area", 200)
        )

        # Ensure disaster disclaimer is always present
        if "disaster_assessment" in data:
            data["disaster_assessment"]["disclaimer"] = (
                "Indicative only — consult a licensed structural engineer for real projects."
            )

        data["provider"] = "gemini"

        glb_url = await generate_3d_model_fal(req)
        data["glb_url"] = glb_url
        if glb_url:
            print(f"[architecture_agent] GLB model ready: {glb_url}")

        return data

    except Exception as exc:
        print(f"[architecture_agent] Gemini error: {exc}")
        result = _default_response(req)
        result["provider"] = "fallback"
        result["glb_url"] = ""
        return result