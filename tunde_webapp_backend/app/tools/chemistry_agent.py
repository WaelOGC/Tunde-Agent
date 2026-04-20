"""
Chemistry Agent — structured explanations + molecular geometry for 3D visualization.

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

CHEMISTRY_AGENT_SYSTEM_PROMPT = """You are a precise chemistry educator and safety-conscious assistant.
When given a chemistry question:
1. Identify reaction type: organic, inorganic, acid_base, redox, or general
2. Explain clearly with proper chemical notation
3. Balance any equations
4. List molecules involved with their atoms for 3D visualization (coordinates in ångström-scale relative positions; keep small molecules compact)
5. Flag any hazards honestly
6. NEVER provide instructions for dangerous, explosive, or illegal synthesis
7. Always respond in JSON format:
{"reaction_type":"...","explanation":"...","balanced_equation":"...","molecules":[{"name":"...","formula":"...","atoms":[{"element":"O","x":0,"y":0,"z":0},{"element":"H","x":1,"y":0.5,"z":0}],"bonds":[[0,1],[0,2]]}],"hazard_level":"none/low/medium/high","hazard_warning":"...","safety_tips":["..."],"confidence":"high/medium/low"}
"""

_ALLOWED_REACTION = frozenset({"organic", "inorganic", "acid_base", "redox", "general"})
_ALLOWED_HAZARD = frozenset({"none", "low", "medium", "high"})


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


def _normalize_reaction_type(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if t in _ALLOWED_REACTION:
        return t
    if "acid" in t and "base" in t:
        return "acid_base"
    if "redox" in t or "oxidation" in t:
        return "redox"
    if "organic" in t:
        return "organic"
    if "inorganic" in t:
        return "inorganic"
    return "general"


def _normalize_hazard_level(raw: Any) -> str:
    if not isinstance(raw, str):
        raw = str(raw or "")
    t = raw.strip().lower()
    if t in _ALLOWED_HAZARD:
        return t
    if "high" in t or "severe" in t:
        return "high"
    if "medium" in t or "moderate" in t:
        return "medium"
    if "low" in t:
        return "low"
    return "none"


def _parse_atom(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    sym = raw.get("element") or raw.get("Element") or raw.get("type") or raw.get("symbol") or ""
    sym = str(sym).strip()
    if len(sym) > 3:
        sym = sym[:3]
    try:
        x = float(raw.get("x", 0))
        y = float(raw.get("y", 0))
        z = float(raw.get("z", 0))
    except (TypeError, ValueError):
        x, y, z = 0.0, 0.0, 0.0
    return {"element": sym or "C", "x": x, "y": y, "z": z}


def _parse_bond(raw: Any) -> tuple[int, int] | None:
    if isinstance(raw, (list, tuple)) and len(raw) >= 2:
        try:
            a = int(raw[0])
            b = int(raw[1])
            return (a, b)
        except (TypeError, ValueError):
            return None
    return None


def _parse_molecule(raw: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"name": "", "formula": "", "atoms": [], "bonds": []}
    if not isinstance(raw, dict):
        return out
    out["name"] = str(raw.get("name", "") or "").strip()
    out["formula"] = str(raw.get("formula", "") or "").strip()
    atoms_raw = raw.get("atoms")
    atoms: list[dict[str, Any]] = []
    if isinstance(atoms_raw, list):
        for a in atoms_raw[:200]:
            p = _parse_atom(a)
            if p:
                atoms.append(p)
    out["atoms"] = atoms
    bonds_raw = raw.get("bonds")
    bonds: list[list[int]] = []
    if isinstance(bonds_raw, list):
        for br in bonds_raw[:500]:
            pair = _parse_bond(br)
            if pair:
                bonds.append([pair[0], pair[1]])
    out["bonds"] = bonds
    return out


def _parse_response_json(raw: str) -> dict[str, Any]:
    cleaned = _strip_json_fence(raw)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")

    molecules_raw = data.get("molecules")
    molecules: list[dict[str, Any]] = []
    if isinstance(molecules_raw, list):
        for m in molecules_raw[:24]:
            molecules.append(_parse_molecule(m))

    tips_raw = data.get("safety_tips")
    tips: list[str] = []
    if isinstance(tips_raw, list):
        for t in tips_raw[:32]:
            if isinstance(t, str) and t.strip():
                tips.append(t.strip())
            elif t is not None:
                s = str(t).strip()
                if s:
                    tips.append(s)

    expl = data.get("explanation")
    explanation = expl.strip() if isinstance(expl, str) else ""
    bal = data.get("balanced_equation")
    balanced = bal.strip() if isinstance(bal, str) else ""
    hw = data.get("hazard_warning")
    hazard_warning = hw.strip() if isinstance(hw, str) else ""

    conf_raw = data.get("confidence")
    confidence = _normalize_confidence(conf_raw if isinstance(conf_raw, str) else str(conf_raw or ""))

    return {
        "reaction_type": _normalize_reaction_type(data.get("reaction_type")),
        "explanation": explanation,
        "balanced_equation": balanced,
        "molecules": molecules,
        "hazard_level": _normalize_hazard_level(data.get("hazard_level")),
        "hazard_warning": hazard_warning,
        "safety_tips": tips,
        "confidence": confidence,
    }


def _fallback_from_raw(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    return {
        "reaction_type": "general",
        "explanation": text if text else "(No structured chemistry response returned.)",
        "balanced_equation": "",
        "molecules": [],
        "hazard_level": "none",
        "hazard_warning": "",
        "safety_tips": [],
        "confidence": "low",
    }


async def explain_chemistry_question(question: str) -> dict[str, Any]:
    cleaned = (question or "").strip()
    if not cleaned:
        raise ValueError("question must be non-empty")

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)

    try:
        raw = await asyncio.to_thread(client.complete, CHEMISTRY_AGENT_SYSTEM_PROMPT, cleaned)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Chemistry agent LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        return _parse_response_json(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Chemistry agent JSON parse failed, using fallback: %s", str(exc)[:160])
        return _fallback_from_raw(raw)
