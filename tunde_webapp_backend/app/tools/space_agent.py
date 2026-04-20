"""
Space Agent — structured astronomy explanations + visualization payload for 3D rendering.

Uses ``model_router.resolve_llm_client`` with ``TaskKind.STRUCTURED_JSON``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from tunde_agent.config.settings import get_settings
from tunde_agent.multi_agent.model_router import TaskKind, resolve_llm_client
from tunde_agent.services.llm_service import LLMError

logger = logging.getLogger(__name__)

SPACE_AGENT_SYSTEM_PROMPT = """You are an expert space and astronomy educator. When given a space question:
1. Identify the topic: solar_system, stars, galaxies, black_holes, cosmology, or missions
2. Give a clear structured explanation
3. List 3-5 key fascinating facts
4. Provide cosmic scale context
5. List related space missions (NASA, ESA, JAXA, etc. when relevant)
6. Flag if topic involves unproven or actively debated theories
7. Always include visualization data for 3D rendering (illustrative relative numbers, not fake precision ephemeris)
8. Never fabricate astronomical data — omit or generalize rather than inventing numbers
9. Always respond in JSON format:
{"topic": "solar_system|stars|galaxies|black_holes|cosmology|missions", "explanation": "...", "key_facts": ["..."], "scale": "...", "missions": ["..."], "confidence": "high|medium|low", "is_theoretical": false, "visualization": {"type": "solar_system", "objects": [{"name": "Sun", "radius": 10, "distance": 0, "color": "#FDB813", "type": "star", "moons": []}, {"name": "Earth", "radius": 2, "distance": 50, "color": "#4B9CD3", "type": "planet", "moons": ["Moon"]}]}}
For visualization.type use one of: solar_system, star, black_hole, galaxy, generic.
Use distance (or distance_from_sun) as relative orbit radius for solar_system; radius as relative body size. For star/black_hole modes you may use one primary object in objects with special_features."""


_ALLOWED_TOPIC = frozenset(
    {"solar_system", "stars", "galaxies", "black_holes", "cosmology", "missions"}
)
_ALLOWED_VIZ_TYPE = frozenset({"solar_system", "star", "black_hole", "galaxy", "generic"})


def _strip_json_fence(text: str) -> str:
    s = (text or "").strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


def _normalize_confidence(raw: str) -> str:
    t = (raw or "").strip().lower()
    if t in ("high", "medium", "low"):
        return t
    if "high" in t:
        return "high"
    if "low" in t or "unsure" in t:
        return "low"
    return "medium"


def _normalize_topic(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if t in _ALLOWED_TOPIC:
        return t
    if "black" in t and "hole" in t:
        return "black_holes"
    if "solar" in t or "planet" in t:
        return "solar_system"
    if "galax" in t:
        return "galaxies"
    if "star" in t:
        return "stars"
    if "mission" in t or "launch" in t:
        return "missions"
    if "cosmo" in t:
        return "cosmology"
    return "solar_system"


def _normalize_viz_type(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if t in _ALLOWED_VIZ_TYPE:
        return t
    if "solar" in t:
        return "solar_system"
    if "black" in t:
        return "black_hole"
    if "galax" in t:
        return "galaxy"
    return "solar_system"


def _parse_object(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    name = str(raw.get("name", "") or "").strip() or "Body"
    try:
        radius = float(raw.get("radius", raw.get("size", 1)))
    except (TypeError, ValueError):
        radius = 1.0
    dist_raw = raw.get("distance")
    if dist_raw is None:
        dist_raw = raw.get("distance_from_sun")
    try:
        distance = float(dist_raw if dist_raw is not None else 0)
    except (TypeError, ValueError):
        distance = 0.0
    color = raw.get("color") or "#a8b8c8"
    if not isinstance(color, str):
        color = str(color)
    color = color.strip() or "#a8b8c8"
    body_type = str(raw.get("type", "") or "body").strip().lower()
    moons_raw = raw.get("moons")
    moons: list[str] = []
    if isinstance(moons_raw, list):
        for m in moons_raw[:64]:
            if isinstance(m, str) and m.strip():
                moons.append(m.strip())
            elif m is not None:
                s = str(m).strip()
                if s:
                    moons.append(s)
    elif moons_raw is not None:
        try:
            n = int(moons_raw)
            if n > 0:
                moons = [f"{n} moon(s)"]
        except (TypeError, ValueError):
            pass
    sf = raw.get("special_features")
    special: str | list[str]
    if isinstance(sf, list):
        special = [str(x).strip() for x in sf[:24] if str(x).strip()]
    else:
        special = str(sf or "").strip()

    out: dict[str, Any] = {
        "name": name,
        "radius": max(0.01, radius),
        "distance": max(0.0, distance),
        "color": color,
        "type": body_type or "body",
        "moons": moons,
    }
    if special:
        out["special_features"] = special
    return out


def _parse_visualization(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"type": "solar_system", "objects": []}
    vtype = _normalize_viz_type(raw.get("type"))
    objs_raw = raw.get("objects") or raw.get("bodies") or []
    objects: list[dict[str, Any]] = []
    if isinstance(objs_raw, list):
        for o in objs_raw[:48]:
            p = _parse_object(o)
            if p:
                objects.append(p)
    return {"type": vtype, "objects": objects}


def _parse_response_json(raw: str) -> dict[str, Any]:
    cleaned = _strip_json_fence(raw)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")

    expl = data.get("explanation")
    explanation = expl.strip() if isinstance(expl, str) else ""

    kf_raw = data.get("key_facts")
    key_facts: list[str] = []
    if isinstance(kf_raw, list):
        for x in kf_raw[:24]:
            if isinstance(x, str) and x.strip():
                key_facts.append(x.strip())
            elif x is not None:
                s = str(x).strip()
                if s:
                    key_facts.append(s)

    sc = data.get("scale")
    scale = sc.strip() if isinstance(sc, str) else ""

    miss_raw = data.get("missions")
    missions: list[str] = []
    if isinstance(miss_raw, list):
        for m in miss_raw[:48]:
            if isinstance(m, str) and m.strip():
                missions.append(m.strip())
            elif m is not None:
                s = str(m).strip()
                if s:
                    missions.append(s)

    conf_raw = data.get("confidence")
    confidence = _normalize_confidence(conf_raw if isinstance(conf_raw, str) else str(conf_raw or ""))

    iso = data.get("is_theoretical")
    if isinstance(iso, bool):
        is_theoretical = iso
    elif isinstance(iso, str):
        is_theoretical = iso.strip().lower() in ("true", "1", "yes")
    else:
        is_theoretical = bool(iso)

    viz = _parse_visualization(data.get("visualization"))

    return {
        "topic": _normalize_topic(data.get("topic")),
        "explanation": explanation,
        "key_facts": key_facts,
        "scale": scale,
        "missions": missions,
        "confidence": confidence,
        "is_theoretical": is_theoretical,
        "visualization": viz,
    }


def _fallback_from_raw(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    return {
        "topic": "solar_system",
        "explanation": text if text else "(No structured space response returned.)",
        "key_facts": [],
        "scale": "",
        "missions": [],
        "confidence": "low",
        "is_theoretical": False,
        "visualization": {"type": "solar_system", "objects": []},
    }


async def explain_space_question(question: str) -> dict[str, Any]:
    cleaned = (question or "").strip()
    if not cleaned:
        raise ValueError("question must be non-empty")

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, SPACE_AGENT_SYSTEM_PROMPT, cleaned)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Space agent LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_response_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Space agent JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw)
