"""
Data Analyst — tabular profiling + LLM narrative (JSON contract).

Parses pasted CSV/TSV/JSON text with pandas, computes aggregate statistics locally,
then asks the LLM for insights and narrative using **only** statistical profiles (no raw rows).
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import re
from typing import Any

import numpy as np
import pandas as pd

from tunde_agent.config.settings import get_settings
from tunde_agent.multi_agent.model_router import TaskKind, resolve_llm_client
from tunde_agent.services.llm_service import LLMError

logger = logging.getLogger(__name__)

MAX_PARSE_ROWS = 50_000
MAX_LLM_PROFILE_CHARS = 24_000

DATA_ANALYST_SYSTEM_PROMPT = """You are an expert data analyst. You will receive a JSON **profile** of a dataset
(column names, dtypes, row/column counts, per-column aggregates, and any pre-detected issues). The profile intentionally
excludes raw cell values — never invent specific names, emails, IDs, or other sensitive literals.

When given this profile:
1. Analyze the structure and content at a statistical level
2. Interpret the provided summary statistics (do not contradict given numeric aggregates)
3. Discover the **5 most important** insights (non-overlapping, actionable)
4. Write one clear **ai_narrative** paragraph in plain English explaining what the dataset suggests overall
5. List **smart_alerts**: anomalies, outliers, skew, missingness, duplicates, or concerning patterns implied by the profile
6. Assess **data_quality** with score good|fair|poor and short **notes**
7. Propose **chart_data** for Chart.js: choose **suggested_chart** as one of bar|line|pie|scatter using only columns
   that appear in the profile. Include **labels** (strings) and **datasets** as an array of objects with **label**,
   **data** (numbers for bar/line/pie; for scatter **data** must be an array of objects {"x": number, "y": number}
   referencing two numeric columns from the profile), and **color** as a hex string (e.g. #6366f1).
8. List **trends**: objects with **metric** (short label), **direction** one of up|down|stable, and **detail** (one line,
   consistent with aggregates — no fabricated exact row values).
9. List **predictions**: objects with **text** — simple, cautious forward-looking statements (e.g. "If the recent trend
   in column X continues…") with clear uncertainty; never present as financial/medical/legal advice.
10. Never expose or share raw sensitive data; do not fabricate unseen values
11. Always respond in JSON ONLY (no markdown fences) with exactly this shape:
{"key_insights": ["...", "...", "...", "...", "..."], "ai_narrative": "...", "smart_alerts": ["..."],
 "data_quality": {"score": "good", "notes": "..."}, "confidence": "high",
 "chart_data": {"suggested_chart": "bar", "labels": ["Jan", "Feb"], "datasets": [{"label": "Sales", "data": [1,2], "color": "#6366f1"}]},
 "trends": [{"metric": "Revenue", "direction": "up", "detail": "..."}],
 "predictions": [{"text": "..."}]}
"""


DATA_FOLLOW_UP_SYSTEM_PROMPT = """You answer follow-up questions about a tabular dataset analysis.
You receive: the user's **question**, optional **original_data** (raw table text, may be truncated), and
**previous_analysis** (JSON snapshot: insights, narrative, stats, chart_data, trends, predictions).

Rules:
- Ground answers in previous_analysis; cite column names and aggregate patterns only.
- If the question cannot be answered from the snapshot (missing columns or values), say what is missing — do not invent numbers.
- Keep the answer focused and practical (under ~400 words unless the question clearly needs more).
- Respond in JSON ONLY (no markdown fences): {"answer": "..."}
"""


def _strip_json_fence(text: str) -> str:
    s = (text or "").strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", s, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return s


def _normalize_confidence(raw: Any) -> str:
    t = (raw or "").strip().lower() if isinstance(raw, str) else str(raw or "").strip().lower()
    if t in ("high", "medium", "low"):
        return t
    if "high" in t:
        return "high"
    if "low" in t:
        return "low"
    return "medium"


def _normalize_quality_score(raw: Any) -> str:
    t = (raw or "").strip().lower() if isinstance(raw, str) else str(raw or "").strip().lower()
    if t in ("good", "fair", "poor"):
        return t
    if "poor" in t or "bad" in t:
        return "poor"
    if "good" in t or "excellent" in t:
        return "good"
    return "fair"


def _string_list(raw: Any, *, max_items: int = 32) -> list[str]:
    out: list[str] = []
    if not isinstance(raw, list):
        return out
    for x in raw[:max_items]:
        if isinstance(x, str) and x.strip():
            out.append(x.strip())
        elif x is not None:
            s = str(x).strip()
            if s:
                out.append(s)
    return out


def _read_frame(raw: str) -> pd.DataFrame:
    s = (raw or "").strip()
    if not s:
        raise ValueError("data must be non-empty")
    if len(s) > 2_000_000:
        raise ValueError("data exceeds maximum size")

    head = s[:1]
    if head in ("[", "{"):
        try:
            df = pd.read_json(io.StringIO(s))
        except (ValueError, TypeError) as exc:
            raise ValueError("Could not parse JSON table — use an array of objects or records.") from exc
    else:
        try:
            df = pd.read_csv(io.StringIO(s), sep=None, engine="python", on_bad_lines="skip")
        except Exception as exc:
            raise ValueError("Could not parse CSV/TSV — check delimiters and headers.") from exc

    if df.empty or len(df.columns) == 0:
        raise ValueError("Parsed dataset is empty.")

    if len(df) > MAX_PARSE_ROWS:
        df = df.iloc[:MAX_PARSE_ROWS].copy()

    df.columns = [str(c).strip() or f"column_{i}" for i, c in enumerate(df.columns)]
    return df


def _json_safe_number(v: Any) -> float | int | None:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, (np.integer, int)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        x = float(v)
        if np.isnan(x) or np.isinf(x):
            return None
        return x
    return None


def _compute_summary_stats(df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for col in df.columns:
        s = df[col]
        entry: dict[str, Any] = {
            "dtype": str(s.dtype),
            "null_count": int(s.isna().sum()),
            "non_null_count": int(s.notna().sum()),
        }
        sn = pd.to_numeric(s, errors="coerce")
        if sn.notna().sum() >= max(3, int(0.6 * len(s))):
            clean = sn.dropna()
            entry["min"] = _json_safe_number(clean.min())
            entry["max"] = _json_safe_number(clean.max())
            entry["mean"] = _json_safe_number(float(clean.mean()))
            entry["median"] = _json_safe_number(float(clean.median()))
        else:
            entry["min"] = None
            entry["max"] = None
            entry["mean"] = None
            entry["median"] = None
            vc = s.astype("string").dropna()
            if len(vc):
                entry["approx_distinct"] = int(vc.nunique())
        out[str(col)] = entry
    return out


def _iqr_outlier_alerts(df: pd.DataFrame) -> list[str]:
    alerts: list[str] = []
    for col in df.columns:
        sn = pd.to_numeric(df[col], errors="coerce")
        if sn.notna().sum() < 8:
            continue
        q1 = float(sn.quantile(0.25))
        q3 = float(sn.quantile(0.75))
        iqr = q3 - q1
        if iqr <= 0:
            continue
        low = q1 - 1.5 * iqr
        high = q3 + 1.5 * iqr
        mask = (sn < low) | (sn > high)
        n = int(mask.sum())
        if n > 0:
            alerts.append(f'Column "{col}" has about {n} statistical outlier(s) by IQR rule (tails beyond typical range).')
    return alerts[:12]


def _heuristic_quality(df: pd.DataFrame, summary: dict[str, dict[str, Any]]) -> dict[str, str]:
    n = len(df)
    if n == 0:
        return {"score": "poor", "notes": "No rows after parsing."}
    total_cells = n * max(1, len(df.columns))
    null_cells = sum(int(v.get("null_count") or 0) for v in summary.values())
    null_ratio = null_cells / total_cells if total_cells else 0.0
    dup_ratio = float(df.duplicated().sum()) / n if n else 0.0

    notes: list[str] = []
    score = "good"
    if null_ratio > 0.05:
        score = "fair"
        notes.append(f"Missing values cover about {null_ratio * 100:.1f}% of cells.")
    if dup_ratio > 0.02:
        score = "fair" if score == "good" else score
        notes.append(f"Duplicate rows appear in about {dup_ratio * 100:.1f}% of rows.")
    if null_ratio > 0.25 or dup_ratio > 0.15:
        score = "poor"
    if not notes:
        notes.append("Structure is reasonably complete for exploratory analysis.")
    return {"score": score, "notes": " ".join(notes)}


def _numeric_columns(df: pd.DataFrame, *, min_ratio: float = 0.5) -> list[str]:
    n = len(df)
    if n == 0:
        return []
    out: list[str] = []
    need = max(3, int(min_ratio * n))
    for col in df.columns:
        sn = pd.to_numeric(df[col], errors="coerce")
        if int(sn.notna().sum()) >= need:
            out.append(str(col))
    return out


def _build_chart_data_from_df(df: pd.DataFrame) -> dict[str, Any]:
    """Deterministic Chart.js-oriented payload from parsed frame."""
    n = len(df)
    default: dict[str, Any] = {"suggested_chart": "bar", "labels": [], "datasets": []}
    if n == 0:
        return default
    max_rows = min(48, n)
    d2 = df.iloc[:max_rows].copy()
    nums = _numeric_columns(d2)
    color = "#6366f1"

    if not nums:
        cat = str(d2.columns[0])
        vc = d2[cat].astype(str).value_counts().head(10)
        if vc.empty:
            return default
        return {
            "suggested_chart": "pie",
            "labels": [str(x)[:48] for x in vc.index.tolist()],
            "datasets": [{"label": "Count", "data": [float(v) for v in vc.tolist()], "color": color}],
        }

    non_num = [str(c) for c in d2.columns if str(c) not in nums]
    if non_num:
        lab_col = non_num[0]
        labels = [str(x)[:32] for x in d2[lab_col].astype(str).tolist()]
    else:
        labels = [f"Row {i + 1}" for i in range(len(d2))]

    vcol = nums[0]
    vals = pd.to_numeric(d2[vcol], errors="coerce")
    data_nums = [_json_safe_number(x) for x in vals.tolist()]
    data_nums = [float(x) if x is not None else 0.0 for x in data_nums]

    if len(nums) >= 2:
        xcol, ycol = nums[0], nums[1]
        sx = pd.to_numeric(d2[xcol], errors="coerce")
        sy = pd.to_numeric(d2[ycol], errors="coerce")
        pts: list[dict[str, float]] = []
        for i in range(len(d2)):
            xv = _json_safe_number(sx.iloc[i])
            yv = _json_safe_number(sy.iloc[i])
            if xv is None or yv is None:
                continue
            pts.append({"x": float(xv), "y": float(yv)})
        pts = pts[:200]
        suggested = "scatter" if len(pts) >= 8 else "bar"
        if suggested == "scatter":
            return {
                "suggested_chart": "scatter",
                "labels": [],
                "datasets": [{"label": f"{xcol} vs {ycol}", "data": pts, "color": color}],
            }

    return {
        "suggested_chart": "bar",
        "labels": labels,
        "datasets": [{"label": str(vcol), "data": data_nums, "color": color}],
    }


def _compute_trends_from_df(df: pd.DataFrame) -> list[dict[str, Any]]:
    n = len(df)
    if n < 8:
        return []
    half = max(1, n // 2)
    trends: list[dict[str, Any]] = []
    for col in df.columns:
        sn = pd.to_numeric(df[col], errors="coerce")
        if int(sn.notna().sum()) < 8:
            continue
        a = sn.iloc[:half].dropna()
        b = sn.iloc[half:].dropna()
        if len(a) < 3 or len(b) < 3:
            continue
        ma, mb = float(a.mean()), float(b.mean())
        if mb > ma * 1.05:
            direction = "up"
        elif mb < ma * 0.95:
            direction = "down"
        else:
            direction = "stable"
        trends.append(
            {
                "metric": str(col),
                "direction": direction,
                "detail": f"First-half vs second-half mean: {ma:.4g} → {mb:.4g}",
            }
        )
        if len(trends) >= 8:
            break
    return trends


def _compute_predictions_from_df(df: pd.DataFrame) -> list[dict[str, str]]:
    predictions: list[dict[str, str]] = []
    for col in df.columns:
        sn = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(sn) < 5:
            continue
        tail_n = min(12, len(sn))
        y = sn.iloc[-tail_n:].to_numpy(dtype=float)
        x = np.arange(len(y), dtype=float)
        try:
            coeffs = np.polyfit(x, y, 1)
        except (np.linalg.LinAlgError, ValueError):
            continue
        nxt = float(np.polyval(coeffs, float(len(y))))
        last = float(y[-1])
        predictions.append(
            {
                "text": (
                    f"If the recent linear trend in «{col}» continues (illustrative only, not a forecast for decisions), "
                    f"the next step might be around {nxt:.4g} vs last observed ~{last:.4g}."
                )
            }
        )
        if predictions:
            break
    return predictions[:5]


def _normalize_direction(raw: Any) -> str:
    t = (raw or "").strip().lower() if isinstance(raw, str) else str(raw or "").strip().lower()
    if t in ("up", "down", "stable"):
        return t
    if "up" in t:
        return "up"
    if "down" in t:
        return "down"
    return "stable"


def _trends_from_llm(raw: Any, *, max_items: int = 12) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not isinstance(raw, list):
        return out
    for item in raw[:max_items]:
        if not isinstance(item, dict):
            continue
        metric = item.get("metric") or item.get("title") or ""
        metric = str(metric).strip() or "Trend"
        detail = item.get("detail") or item.get("description") or ""
        detail = str(detail).strip() or "See profile."
        out.append({"metric": metric, "direction": _normalize_direction(item.get("direction")), "detail": detail})
    return out


def _predictions_from_llm(raw: Any, *, max_items: int = 8) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if not isinstance(raw, list):
        return out
    for item in raw[:max_items]:
        if isinstance(item, dict):
            t = item.get("text") or item.get("prediction") or ""
        else:
            t = str(item)
        t = str(t).strip()
        if t:
            out.append({"text": t})
    return out


def _sanitize_chart_data(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    sc = str(raw.get("suggested_chart") or "bar").strip().lower()
    if sc not in ("bar", "line", "pie", "scatter"):
        sc = "bar"
    labels_raw = raw.get("labels")
    labels: list[str] = []
    if isinstance(labels_raw, list):
        labels = [str(x)[:64] for x in labels_raw[:120] if x is not None]
    datasets_out: list[dict[str, Any]] = []
    ds_in = raw.get("datasets")
    if isinstance(ds_in, list):
        for ds in ds_in[:4]:
            if not isinstance(ds, dict):
                continue
            label = str(ds.get("label") or "Series").strip() or "Series"
            color = str(ds.get("color") or "#6366f1").strip() or "#6366f1"
            data_raw = ds.get("data")
            if sc == "scatter" and isinstance(data_raw, list):
                pts: list[dict[str, float]] = []
                for p in data_raw[:300]:
                    if isinstance(p, dict):
                        xv = _json_safe_number(p.get("x"))
                        yv = _json_safe_number(p.get("y"))
                        if xv is None or yv is None:
                            continue
                        pts.append({"x": float(xv), "y": float(yv)})
                    elif isinstance(p, (list, tuple)) and len(p) >= 2:
                        xv = _json_safe_number(p[0])
                        yv = _json_safe_number(p[1])
                        if xv is None or yv is None:
                            continue
                        pts.append({"x": float(xv), "y": float(yv)})
                if pts:
                    datasets_out.append({"label": label[:80], "data": pts, "color": color})
            elif isinstance(data_raw, list):
                nums: list[float] = []
                for v in data_raw[:200]:
                    j = _json_safe_number(v)
                    nums.append(float(j) if j is not None else 0.0)
                if nums:
                    datasets_out.append({"label": label[:80], "data": nums, "color": color})
    if not datasets_out:
        return None
    return {"suggested_chart": sc, "labels": labels if sc != "scatter" else [], "datasets": datasets_out}


def _merge_chart_data(computed: dict[str, Any], llm_raw: Any) -> dict[str, Any]:
    llm_cd = _sanitize_chart_data(llm_raw)
    if not llm_cd:
        return computed
    out = dict(computed)
    if llm_cd.get("suggested_chart") in ("bar", "line", "pie", "scatter"):
        out["suggested_chart"] = llm_cd["suggested_chart"]
    if llm_cd.get("labels"):
        out["labels"] = llm_cd["labels"]
    if llm_cd.get("datasets"):
        out["datasets"] = llm_cd["datasets"]
    if not out.get("datasets"):
        out["datasets"] = computed.get("datasets", [])
    if not out.get("labels") and computed.get("labels"):
        out["labels"] = computed["labels"]
    return out


def _merge_trends(heuristic: list[dict[str, Any]], llm: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for t in [*heuristic, *llm]:
        key = (t.get("metric"), t.get("direction"), t.get("detail"))
        sk = str(key)
        if sk in seen:
            continue
        seen.add(sk)
        merged.append(t)
        if len(merged) >= 16:
            break
    return merged


def _merge_predictions(heuristic: list[dict[str, str]], llm: list[dict[str, str]]) -> list[dict[str, str]]:
    out = list(heuristic)
    seen = {x["text"] for x in out}
    for p in llm:
        tx = p.get("text") or ""
        if tx and tx not in seen:
            out.append({"text": tx})
            seen.add(tx)
        if len(out) >= 10:
            break
    return out


def _build_profile_payload(
    *,
    dataset_name: str,
    row_count: int,
    column_count: int,
    columns: list[str],
    summary_stats: dict[str, dict[str, Any]],
    preset_alerts: list[str],
) -> str:
    payload = {
        "dataset_name": dataset_name,
        "row_count": row_count,
        "column_count": column_count,
        "columns": columns,
        "summary_stats": summary_stats,
        "preset_alerts": preset_alerts,
    }
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if len(text) > MAX_LLM_PROFILE_CHARS:
        text = text[:MAX_LLM_PROFILE_CHARS] + "\n…(profile truncated for model context)"
    return text


def _parse_llm_part(raw: str) -> dict[str, Any]:
    cleaned = _strip_json_fence(raw)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("LLM response is not a JSON object")
    insights = _string_list(data.get("key_insights"), max_items=12)
    fallbacks = [
        "Compare dispersion (min/max vs mean) to see whether a few columns dominate scale.",
        "Check columns with many nulls before blending this file with other sources.",
        "Scan categorical cardinality to spot potential ID columns unsuitable for naive charts.",
    ]
    for fb in fallbacks:
        if len(insights) >= 5:
            break
        if fb not in insights:
            insights.append(fb)
    insights_final = insights[:5] if insights else fallbacks[:5]
    narrative = data.get("ai_narrative")
    ai_narrative = narrative.strip() if isinstance(narrative, str) else str(narrative or "").strip()
    alerts = _string_list(data.get("smart_alerts"), max_items=24)
    dq = data.get("data_quality")
    notes = ""
    score = "fair"
    if isinstance(dq, dict):
        score = _normalize_quality_score(dq.get("score"))
        nraw = dq.get("notes")
        notes = nraw.strip() if isinstance(nraw, str) else str(nraw or "").strip()
    conf = _normalize_confidence(data.get("confidence"))
    return {
        "key_insights": insights_final,
        "ai_narrative": ai_narrative or "The dataset shows mixed signals; review alerts and quality notes.",
        "smart_alerts": alerts,
        "data_quality": {"score": score, "notes": notes or "See aggregate statistics."},
        "confidence": conf,
        "chart_data_llm": data.get("chart_data"),
        "trends_llm": _trends_from_llm(data.get("trends")),
        "predictions_llm": _predictions_from_llm(data.get("predictions")),
    }


def _fallback_llm(*, dataset_name: str, row_count: int, column_count: int) -> dict[str, Any]:
    return {
        "key_insights": [
            f'Dataset "{dataset_name}" has {row_count} rows and {column_count} columns.',
            "Review numeric spreads in summary statistics for dominant scales.",
            "Compare null counts across columns to spot weakly populated fields.",
            "Use smart alerts as a first pass on anomalies before deeper modeling.",
            "Validate any business rules against the observed distributions.",
        ],
        "ai_narrative": (
            f'This tabular dataset ("{dataset_name}") contains {row_count} records across {column_count} attributes. '
            "The automated profile highlights central tendencies and gaps so you can decide where to clean, enrich, or segment next."
        ),
        "smart_alerts": [],
        "data_quality": {"score": "fair", "notes": "LLM narrative unavailable; rely on computed statistics."},
        "confidence": "low",
        "chart_data_llm": None,
        "trends_llm": [],
        "predictions_llm": [],
    }


async def run_data_analysis(data: str, dataset_name: str = "") -> dict[str, Any]:
    """
    Run Data Analyst pipeline: parse → stats → LLM JSON merge.
    """
    df = _read_frame(data)
    name = (dataset_name or "").strip() or "Dataset"
    row_count = int(len(df))
    column_count = int(len(df.columns))
    columns = [str(c) for c in df.columns.tolist()]
    summary_stats = _compute_summary_stats(df)
    preset_alerts = _iqr_outlier_alerts(df)
    null_ratio = float(df.isna().to_numpy().mean()) if row_count and column_count else 0.0
    if null_ratio > 0.08:
        preset_alerts.insert(0, f"Missing values are common overall (~{null_ratio * 100:.1f}% of cells).")
    dup_n = int(df.duplicated().sum())
    if dup_n > 0:
        preset_alerts.insert(0, f"About {dup_n} duplicate row(s) detected.")

    heuristic_dq = _heuristic_quality(df, summary_stats)
    profile_text = _build_profile_payload(
        dataset_name=name,
        row_count=row_count,
        column_count=column_count,
        columns=columns,
        summary_stats=summary_stats,
        preset_alerts=preset_alerts,
    )

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)
    user_prompt = f"Dataset profile (aggregates only):\n{profile_text}"

    try:
        raw = await asyncio.to_thread(client.complete, DATA_ANALYST_SYSTEM_PROMPT, user_prompt)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Data analyst LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        llm_part = _parse_llm_part(raw)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Data analyst JSON parse failed, using fallback: %s", str(exc)[:160])
        llm_part = _fallback_llm(dataset_name=name, row_count=row_count, column_count=column_count)

    merged_alerts = list(dict.fromkeys([*preset_alerts, *llm_part["smart_alerts"]]))[:20]

    dq = llm_part["data_quality"]
    if not isinstance(dq, dict):
        dq = dict(heuristic_dq)
    else:
        dq = {
            "score": _normalize_quality_score(dq.get("score")),
            "notes": (dq.get("notes") or "").strip() if isinstance(dq.get("notes"), str) else str(dq.get("notes") or ""),
        }
        if heuristic_dq["score"] == "poor" and dq["score"] != "poor":
            dq = {"score": "poor", "notes": heuristic_dq["notes"]}
        elif heuristic_dq["score"] == "fair" and dq["score"] == "good":
            dq = {"score": "fair", "notes": f"{heuristic_dq['notes']} {dq['notes']}".strip()}
        if not dq["notes"]:
            dq["notes"] = heuristic_dq["notes"]

    chart_computed = _build_chart_data_from_df(df)
    trends_h = _compute_trends_from_df(df)
    preds_h = _compute_predictions_from_df(df)
    chart_data_llm = llm_part.get("chart_data_llm")
    trends_llm = llm_part.get("trends_llm") or []
    predictions_llm = llm_part.get("predictions_llm") or []
    chart_data = _merge_chart_data(chart_computed, chart_data_llm)
    trends = _merge_trends(trends_h, trends_llm)
    predictions = _merge_predictions(preds_h, predictions_llm)

    return {
        "dataset_name": name,
        "row_count": row_count,
        "column_count": column_count,
        "columns": columns,
        "summary_stats": summary_stats,
        "key_insights": llm_part["key_insights"],
        "ai_narrative": llm_part["ai_narrative"],
        "smart_alerts": merged_alerts,
        "data_quality": dq,
        "confidence": llm_part.get("confidence") or "medium",
        "chart_data": chart_data,
        "trends": trends,
        "predictions": predictions,
    }


MAX_FOLLOW_ORIGINAL_CHARS = 120_000
MAX_FOLLOW_ANALYSIS_CHARS = 48_000


async def run_data_follow_up(
    question: str,
    original_data: str,
    previous_analysis: dict[str, Any],
) -> dict[str, Any]:
    """
    Answer a follow-up question using prior analysis snapshot (+ optional raw table text).
    """
    q = (question or "").strip()
    if not q:
        raise ValueError("question must be non-empty")
    od = (original_data or "").strip()
    if len(od) > MAX_FOLLOW_ORIGINAL_CHARS:
        od = od[:MAX_FOLLOW_ORIGINAL_CHARS] + "\n…(truncated)"
    pa = previous_analysis if isinstance(previous_analysis, dict) else {}
    pa_json = json.dumps(pa, ensure_ascii=False)
    if len(pa_json) > MAX_FOLLOW_ANALYSIS_CHARS:
        pa_json = pa_json[:MAX_FOLLOW_ANALYSIS_CHARS] + "\n…(truncated)"
    user_prompt = f"Question:\n{q}\n\nOriginal data (may be truncated):\n{od}\n\nPrevious analysis JSON:\n{pa_json}"

    settings = get_settings()
    client = resolve_llm_client(settings, TaskKind.STRUCTURED_JSON)
    try:
        raw = await asyncio.to_thread(client.complete, DATA_FOLLOW_UP_SYSTEM_PROMPT, user_prompt)
    except LLMError:
        raise
    except Exception as exc:
        logger.exception("Data follow-up LLM call failed")
        raise LLMError(str(exc)) from exc

    try:
        data = json.loads(_strip_json_fence(raw))
        if not isinstance(data, dict):
            raise ValueError("not an object")
        ans = data.get("answer")
        answer = ans.strip() if isinstance(ans, str) else str(ans or "").strip()
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        logger.warning("Data follow-up JSON parse failed: %s", str(exc)[:160])
        answer = ""

    if not answer:
        answer = "I could not derive a reliable follow-up answer from the provided snapshot. Try re-running analysis or narrowing your question."

    return {"answer": answer}
