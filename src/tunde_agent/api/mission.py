"""Research mission API (browse → Telegram photo + approval → Gemini summary)."""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from tunde_agent.constants import SMOKE_TEST_USER_ID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mission", tags=["mission"])


class MissionStartRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "topic": "Gold prices today",
                    "user_id": str(SMOKE_TEST_USER_ID),
                },
                {
                    "topic": "Latest AI agent news",
                    "url": "https://example.com/article",
                    "user_id": str(SMOKE_TEST_USER_ID),
                },
            ]
        }
    )

    topic: str = Field(..., min_length=1, max_length=500)
    url: str | None = Field(
        default=None,
        max_length=2048,
        description=(
            "Optional first-priority source. When omitted, URLs are taken from Google organic results "
            "for `topic` (still capped for safety)."
        ),
    )
    user_id: uuid.UUID | None = Field(
        default=None,
        description=(
            "RLS principal UUID. If no row exists yet, it is created automatically. "
            "Omit to use the seeded smoke user."
        ),
    )
    output_language: str | None = Field(
        default=None,
        max_length=12,
        description="Report language hint: 'en' or 'ar' (overrides TUNDE_RESEARCH_OUTPUT_LANG for this mission).",
    )


async def _run_mission_background(
    user_id: uuid.UUID,
    topic: str,
    url: str | None,
    output_language: str | None,
) -> None:
    """Runs sync mission in a thread pool so the event loop is not blocked."""
    from tunde_agent.services.llm_service import LLMError
    from tunde_agent.services.mission_service import execute_research_mission
    from tunde_agent.tools.browser.exceptions import CaptchaHandoffRequired

    try:
        await asyncio.to_thread(
            execute_research_mission,
            user_id,
            topic,
            url,
            output_language=output_language,
        )
        logger.info("Background mission finished user_id=%s topic=%r", user_id, topic[:80])
    except CaptchaHandoffRequired as exc:
        logger.exception(
            "Background mission CAPTCHA handoff user_id=%s url=%s",
            user_id,
            getattr(exc, "url", url or "")[:120],
        )
    except LLMError:
        logger.exception("Background mission LLM error user_id=%s", user_id)
    except Exception:
        logger.exception("Background mission failed user_id=%s", user_id)


@router.post("/start", status_code=202)
async def mission_start(
    body: MissionStartRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    """
    Validates input and **queues** the mission; returns **202 Accepted** immediately.

    Work runs after the response is sent (browser / Swagger no longer spin until the mission ends).
    Follow progress on Telegram and in app logs.
    """
    from tunde_agent.tools.browser.engine import assert_allowed_browse_url

    uid = body.user_id or SMOKE_TEST_USER_ID
    topic = body.topic.strip()
    url = (body.url or "").strip() or None
    if url:
        try:
            assert_allowed_browse_url(url)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    out_lang = (body.output_language or "").strip() or None

    background_tasks.add_task(_run_mission_background, uid, topic, url, out_lang)

    return {
        "status": "accepted",
        "message": (
            "Mission queued. If Telegram shows nothing, open your bot in Telegram and send /start once "
            "(first-time link). Then check Telegram for the screenshot and Approve/Deny; summary after approve."
        ),
        "user_id": str(uid),
        "topic": topic,
        "url": url,
        "output_language": out_lang,
    }
