"""
Google Veo video generation via Gemini API REST (``predictLongRunning`` + operation poll).

See https://ai.google.dev/gemini-api/docs/video — single clips support ``durationSeconds`` 4/6/8;
extension adds ~7s per step (720p). Preset **20** / **30** use chained extension calls.
"""

from __future__ import annotations

import base64
import logging
import time
from typing import Any

import httpx

from tunde_agent.services.llm_service import LLMError

logger = logging.getLogger(__name__)

_BASE = "https://generativelanguage.googleapis.com/v1beta"
_POLL_INTERVAL_SEC = 10.0
_MAX_POLL_SEC = 900.0  # 15 minutes


def _norm_model(model: str) -> str:
    m = (model or "").strip()
    if m.startswith("models/"):
        m = m[len("models/") :]
    return m


def _extract_video_uri_from_operation(body: dict[str, Any]) -> str | None:
    """Best-effort parse of completed operation JSON for a downloadable video URI."""
    resp = body.get("response")
    if not isinstance(resp, dict):
        return None
    gvr = resp.get("generateVideoResponse")
    if not isinstance(gvr, dict):
        return None
    samples = gvr.get("generatedSamples") or gvr.get("generated_samples")
    if not isinstance(samples, list) or not samples:
        videos = gvr.get("generatedVideos") or gvr.get("generated_videos")
        if isinstance(videos, list) and videos:
            first = videos[0]
            if isinstance(first, dict):
                vid = first.get("video")
                if isinstance(vid, dict):
                    u = vid.get("uri")
                    if isinstance(u, str) and u.strip():
                        return u.strip()
        return None
    first = samples[0]
    if not isinstance(first, dict):
        return None
    vid = first.get("video")
    if not isinstance(vid, dict):
        return None
    u = vid.get("uri")
    if isinstance(u, str) and u.strip():
        return u.strip()
    return None


def _operation_error_message(body: dict[str, Any]) -> str | None:
    err = body.get("error")
    if isinstance(err, dict):
        return str(err.get("message") or err)
    resp = body.get("response")
    if isinstance(resp, dict):
        err2 = resp.get("error")
        if isinstance(err2, dict):
            return str(err2.get("message") or err2)
    return None


def _post_predict(
    api_key: str,
    model: str,
    *,
    instances: list[dict[str, Any]],
    parameters: dict[str, Any] | None,
) -> str:
    key = (api_key or "").strip()
    if not key:
        raise LLMError("GEMINI_API_KEY is not set.")
    m = _norm_model(model)
    if not m:
        raise LLMError("GEMINI_VIDEO_MODEL is empty.")
    url = f"{_BASE}/models/{m}:predictLongRunning"
    payload: dict[str, Any] = {"instances": instances}
    if parameters:
        payload["parameters"] = parameters
    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.post(url, params={"key": key}, json=payload)
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPStatusError as e:
        detail = ""
        if e.response is not None:
            try:
                detail = str(e.response.json().get("error", {}).get("message", e.response.text))
            except Exception:
                detail = e.response.text[:500]
        logger.warning("Veo predictLongRunning HTTP %s: %s", e.response.status_code if e.response else "?", detail)
        raise LLMError(f"Video generation could not start: {detail or e!s}") from e
    except httpx.RequestError as e:
        raise LLMError(f"Video request failed: {e!s}") from e

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        raise LLMError("Video API returned no operation name.")
    return name.strip()


def _poll_operation(api_key: str, operation_name: str) -> dict[str, Any]:
    key = (api_key or "").strip()
    url = f"{_BASE}/{operation_name}"
    deadline = time.monotonic() + _MAX_POLL_SEC
    last_body: dict[str, Any] = {}
    while time.monotonic() < deadline:
        try:
            with httpx.Client(timeout=120.0) as client:
                r = client.get(url, params={"key": key})
                r.raise_for_status()
                last_body = r.json()
        except httpx.HTTPStatusError as e:
            detail = ""
            if e.response is not None:
                try:
                    detail = str(e.response.json().get("error", {}).get("message", e.response.text))
                except Exception:
                    detail = e.response.text[:500]
            raise LLMError(f"Video status check failed: {detail or e!s}") from e
        except httpx.RequestError as e:
            raise LLMError(f"Video poll failed: {e!s}") from e

        if last_body.get("done"):
            em = _operation_error_message(last_body)
            if em and not _extract_video_uri_from_operation(last_body):
                raise LLMError(f"Video generation failed: {em}")
            return last_body
        time.sleep(_POLL_INTERVAL_SEC)

    raise LLMError("Video generation timed out — try again when the service is less busy.")


def _download_video_bytes(api_key: str, uri: str) -> bytes:
    key = (api_key or "").strip()
    try:
        with httpx.Client(timeout=300.0, follow_redirects=True) as client:
            r = client.get(uri, headers={"x-goog-api-key": key})
            r.raise_for_status()
            return r.content
    except httpx.HTTPStatusError as e:
        raise LLMError(f"Could not download generated video: {e.response.status_code}") from e
    except httpx.RequestError as e:
        raise LLMError(f"Video download failed: {e!s}") from e


def _generate_one_clip(
    api_key: str,
    model: str,
    prompt: str,
    *,
    duration_seconds: int,
    aspect_ratio: str,
    resolution: str,
    person_generation: str,
    video_inline_b64: str | None = None,
) -> bytes:
    """Run one predictLongRunning job; optional ``video_inline_b64`` for extension."""
    inst: dict[str, Any] = {"prompt": prompt[:8000]}
    if video_inline_b64:
        inst["video"] = {"inlineData": {"mimeType": "video/mp4", "data": video_inline_b64}}

    params: dict[str, Any] = {
        "aspectRatio": aspect_ratio,
        "durationSeconds": duration_seconds,
        "resolution": resolution,
        "personGeneration": person_generation,
    }
    if video_inline_b64:
        # Extension path: 720p only per Google docs (no numberOfVideos — not supported on current models).
        params = {"resolution": "720p"}

    op_name = _post_predict(api_key, model, instances=[inst], parameters=params)
    body = _poll_operation(api_key, op_name)
    uri = _extract_video_uri_from_operation(body)
    if not uri:
        logger.warning("Unexpected Veo operation response keys: %s", list(body.keys()))
        raise LLMError("Video was generated but the response had no download link.")
    return _download_video_bytes(api_key, uri)


def generate_video_mp4_for_preset(
    *,
    api_key: str,
    model: str,
    user_prompt: str,
    preset: str,
    aspect_ratio: str = "16:9",
    resolution: str = "720p",
    person_generation: str = "allow_all",
) -> bytes:
    """
    Full pipeline for Telegram presets **10**, **20**, **30** (seconds — product labels).

    - **10**: one **8s** clip (maximum ``durationSeconds`` for a single Veo generation at 720p).
    - **20**: 8s base + **two** 720p extensions → about **22s** total.
    - **30**: 8s base + **three** extensions → about **29s** total.

    Button labels are product tiers; exact seconds follow vendor limits (see ``docs/01_telegram_bot/media_standards.md``).
    """
    base_prompt = (user_prompt or "").strip()
    if not base_prompt:
        raise LLMError("Video description is empty.")

    p = str(preset).strip()
    if p not in ("10", "20", "30"):
        raise LLMError("Unknown video preset.")

    cinematic = (
        "Cinematic, smooth camera motion, coherent lighting. "
        "If dialogue or SFX are implied, keep them tasteful and mixed clearly.\n\n"
    )
    full_prompt = cinematic + base_prompt

    res_first = resolution if p == "10" else "720p"
    if res_first not in ("720p", "1080p"):
        res_first = "720p"

    video = _generate_one_clip(
        api_key,
        model,
        full_prompt,
        duration_seconds=8,
        aspect_ratio=aspect_ratio,
        resolution=res_first,
        person_generation=person_generation,
    )

    extend_prompt = (
        "Continue this same scene seamlessly from the final frame: same characters, wardrobe, "
        "and location; natural motion and lighting. No hard cuts."
    )

    def _extend(prev: bytes) -> bytes:
        b64 = base64.standard_b64encode(prev).decode("ascii")
        return _generate_one_clip(
            api_key,
            model,
            extend_prompt,
            duration_seconds=8,
            aspect_ratio=aspect_ratio,
            resolution="720p",
            person_generation=person_generation,
            video_inline_b64=b64,
        )

    extra_extends = {"10": 0, "20": 2, "30": 3}[p]
    for _ in range(extra_extends):
        video = _extend(video)
    return video
