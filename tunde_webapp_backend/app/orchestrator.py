"""
TaskOrchestrator (Phase 1.3–1.4): in-memory conveyor belt simulation + QC gateway loop.

QC is a gatekeeper: candidate results must be reviewed. The QC implementation is mock logic for now.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
import threading
from typing import Any

from tunde_webapp_backend.app.task_models import Task, TaskStatus
from tunde_webapp_backend.app.qc_service import qc_service
from tunde_webapp_backend.app.db import db_session, init_db
from tunde_webapp_backend.app.repositories.log_repository import ConversationInput, LogRepository
from tunde_webapp_backend.app.tools import tools_manager
from tunde_webapp_backend.app.tools.file_analyst_tool import augment_user_message_for_action
from tunde_webapp_backend.app.ws_manager import ws_manager

logger = logging.getLogger(__name__)

_QC_MAX_ATTEMPTS = 3

_DASHBOARD_CHAT_RULES = (
    "\n\n---\n[Web dashboard — reply rules]\n"
    "- You are Tunde, a web-based research and analysis assistant. Answer only for this browser workspace.\n"
    "- **Zero-Intro Policy:** Do NOT use “Tunde AI Agent at your service”, “at your service!”, or any similar slogan. "
    "Do NOT introduce yourself unless the user asks who you are. **First line of output** must be a `##` or `###` "
    "heading **or** one short Overview paragraph, then the answer (bullets, pipe tables, etc.).\n"
    "- Prefer structured Markdown (##, ###, lists, pipe tables). Avoid decorative asterisks for emphasis; "
    "use headings and tables instead.\n"
    "- **Emojis:** Use a few relevant emojis to aid scanning—one at the start of major ##/### headings (e.g. 🚀, 📊, 🎯) "
    "and sparingly in bullet lists. Keep it professional; do not replace substance with icons.\n"
    "- Do NOT tell the user to open Telegram, a mobile app, or a messenger bot, or to type /start, /help, "
    "or other bot commands. Do NOT refer to channels outside this web UI.\n"
    "- When a table or infographic appears in the Canvas (from your markdown or from tools), reference it in "
    'prose (e.g. “As shown in the table below…”, “I’ve added an infographic in the canvas that…”).\n'
    "- For direct comparisons of multiple items or metrics, include one compact GitHub-flavored markdown pipe "
    "table (header row, separator row with |---|, body rows). The UI renders it as an interactive canvas table.\n"
    "- Do NOT ask the user to run a separate manual flow to obtain an image; the workspace adds it when enabled.\n"
)

_DASHBOARD_IMAGE_FOLLOWUP = (
    "\n- A real infographic **image block** is already attached to this assistant turn in the web canvas (you will "
    "not see the binary; trust the pipeline). In one or two sentences, describe what it emphasizes; do not offer to "
    "create one later. If there were any image error, do **not** claim an infographic is in the canvas.\n"
)

_TOOL_EXECUTION_POLICY = (
    "\n\n---\n[Execution policy — mandatory]\n"
    "- The server already ran tools for this request (web research / data / image) before you answer.\n"
    "- Do NOT offer to search the web, fetch live data, or \"look up\" information unless you cite facts from "
    "Context from tools above.\n"
    "- Do NOT say you \"can\" or \"will\" generate an image unless the server actually attached a canvas image for "
    "this turn (you will be told explicitly in the dashboard supplement when that is true).\n"
    "- If Context from tools is non-empty, ground your answer in it with specific takeaways.\n"
)


def _result_for_db(result: dict[str, Any] | None) -> dict[str, Any] | None:
    """SQLite-friendly copy: drop inlined image bytes (can exceed column limits)."""
    if result is None or not isinstance(result, dict):
        return result
    out = copy.deepcopy(result)
    blocks = out.get("blocks")
    if not isinstance(blocks, list):
        return out
    slim: list[dict[str, Any]] = []
    for b in blocks:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "image":
            slim.append(
                {
                    "type": "image",
                    "alt": b.get("alt", ""),
                    "_stored": False,
                    "_note": "Image bytes omitted from database; shown live via WebSocket only.",
                }
            )
        elif b.get("type") == "image_error":
            msg = b.get("message")
            slim.append(
                {
                    "type": "image_error",
                    "message": str(msg)[:800] if msg is not None else "",
                }
            )
        else:
            slim.append(copy.deepcopy(b))
    out["blocks"] = slim
    return out


class TaskOrchestrator:
    async def _emit_tool_activity(
        self,
        task: Task,
        message: str,
        *,
        tool: str | None = None,
        phase: str | None = None,
    ) -> None:
        await ws_manager.broadcast(
            event="tool_activity",
            payload={
                "task_id": str(task.task_id),
                "correlation_id": str(task.correlation_id),
                "message": message,
                "tool": tool or "",
                "phase": phase or "",
            },
        )

    async def _broadcast_chat_stream(self, task: Task, service: Any, augmented: str) -> str:
        """
        Consume ``LLMService.chat_stream`` in a worker thread and forward each chunk over WebSocket
        as ``assistant_delta``, then ``assistant_done``. Keeps the event loop responsive.
        """
        loop = asyncio.get_running_loop()
        q: asyncio.Queue[str | None] = asyncio.Queue(maxsize=1024)
        err_holder: list[BaseException] = []

        def producer() -> None:
            try:
                for delta in service.chat_stream(augmented):
                    if not delta:
                        continue
                    fut = asyncio.run_coroutine_threadsafe(q.put(str(delta)), loop)
                    fut.result(timeout=300)
            except BaseException as exc:
                err_holder.append(exc)
            finally:
                try:
                    asyncio.run_coroutine_threadsafe(q.put(None), loop).result(timeout=60)
                except Exception:
                    pass

        t = threading.Thread(target=producer, name="tunde-llm-stream", daemon=True)
        t.start()
        parts: list[str] = []
        try:
            while True:
                chunk = await q.get()
                if chunk is None:
                    break
                parts.append(chunk)
                await ws_manager.broadcast(
                    event="assistant_delta",
                    payload={
                        "task_id": str(task.task_id),
                        "correlation_id": str(task.correlation_id),
                        "delta": chunk,
                    },
                )
        finally:
            t.join(timeout=300)
        if err_holder:
            raise err_holder[0]
        text = "".join(parts).strip()
        await ws_manager.broadcast(
            event="assistant_done",
            payload={
                "task_id": str(task.task_id),
                "correlation_id": str(task.correlation_id),
                "message": text,
            },
        )
        return text

    async def _generate_candidate_text(
        self,
        *,
        user_text: str,
        tool_context: str | None = None,
        dashboard: bool = True,
        will_auto_image: bool = False,
        task: Task | None = None,
    ) -> str:
        """
        Generate a candidate assistant reply.

        Priority:
        1) Use the real Tunde LLM service (Gemini / DeepSeek) when configured.
        2) Fallback to a deterministic message (never echo the user's text verbatim).
        """
        cleaned = (user_text or "").strip()
        if not cleaned:
            return "Tell me what you want to build, and I’ll propose the best next step."

        augmented = cleaned
        tc = (tool_context or "").strip()
        if tc:
            augmented = (
                f"{cleaned}\n\n---\nContext from tools:\n{tc}\n---\n"
                "Use the context when it is relevant. Summarize in clear prose; mention sources only if useful."
            )

        if dashboard:
            augmented += _DASHBOARD_CHAT_RULES
            augmented += _TOOL_EXECUTION_POLICY
        if dashboard and will_auto_image:
            augmented += _DASHBOARD_IMAGE_FOLLOWUP

        try:
            # Reuse the main agent's production LLM wiring so the webapp backend stays thin.
            from tunde_agent.config.settings import get_settings
            from tunde_agent.services.llm_service import LLMService
            from tunde_agent.services.prompt_manager import PromptManager

            settings = get_settings()
            service = LLMService(settings, PromptManager())
            if task is not None:
                try:
                    reply_text = await self._broadcast_chat_stream(task, service, augmented)
                except Exception as stream_exc:
                    logger.warning(
                        "LLM stream failed, falling back to non-streaming chat: %s",
                        str(stream_exc)[:200],
                    )
                    reply_text = str(await asyncio.to_thread(service.chat, augmented) or "").strip()
            else:
                reply_text = str(await asyncio.to_thread(service.chat, augmented) or "").strip()
            if reply_text:
                return reply_text
        except Exception as exc:
            logger.warning("LLM reply generation failed: %s", str(exc)[:200])

        # Safe fallback that confirms receipt without echoing the prompt back.
        return "Got it. I’m processing that now—what outcome should we optimize for (speed, quality, or cost)?"

    async def submit(self, *, payload: dict[str, Any]) -> Task:
        task = Task(payload=payload)
        # Ensure tables exist (dev-friendly). In production this is replaced by migrations.
        init_db()
        # Persist a minimal conversation/message if provided.
        with db_session() as session:
            repo = LogRepository(session)
            user_id = str((payload or {}).get("user_id") or "anonymous")
            conv = repo.create_conversation(ConversationInput(user_id=user_id))
            user_msg = (payload or {}).get("user_message")
            if isinstance(user_msg, str) and user_msg.strip():
                repo.add_message(conv_id=conv.conv_id, role="user", content=user_msg.strip())
            repo.create_task_execution(
                task_id=task.task_id,
                correlation_id=task.correlation_id,
                status=task.status.value,
                agent_id=None,
            )
            repo.add_task_status_event(
                task_id=task.task_id,
                correlation_id=task.correlation_id,
                status=task.status.value,
                message="Task queued.",
            )
        await self._broadcast(task, message="Task queued.")
        asyncio.create_task(self._run(task))
        return task

    async def _run(self, task: Task) -> None:
        cid = str(task.correlation_id)
        tid = str(task.task_id)
        try:
            await self._transition(task, TaskStatus.running, "Task is running.")
            logger.info("[cid=%s task_id=%s] stage=running", cid, tid)
            await asyncio.sleep(0.6)

            # Candidate result (tools + LLM).
            payload = task.payload or {}
            user_msg = payload.get("user_message")
            user_raw = str(user_msg).strip() if isinstance(user_msg, str) else ""
            fc = payload.get("file_context")
            fa = payload.get("file_analyst_action")
            action_key: str | None = None
            if isinstance(fc, dict) and fc.get("file_id") and isinstance(fa, str) and fa.strip():
                action_key = fa.strip().lower()
            user_text = augment_user_message_for_action(user_raw, action_key)

            async def _tool_emit(msg: str, **kwargs: Any) -> None:
                await self._emit_tool_activity(
                    task,
                    msg,
                    tool=kwargs.get("tool"),
                    phase=kwargs.get("phase"),
                )

            outcome = await tools_manager.run_research_and_data(
                task=task,
                user_text=user_text,
                emit=_tool_emit,
            )
            summary_for_image = (outcome.context_text or "").strip() or user_text
            blocks: list[dict[str, Any]] = list(outcome.blocks)
            blocks.extend(
                await tools_manager.generate_image_if_planned(
                    task=task,
                    plan=outcome.plan,
                    user_text=user_raw,
                    reply_text=summary_for_image,
                    emit=_tool_emit,
                )
            )
            has_canvas_image = any(
                isinstance(b, dict)
                and str(b.get("type") or "").lower() == "image"
                and str(b.get("src") or b.get("url") or b.get("data_url") or "").strip()
                for b in blocks
            )
            candidate_text = await self._generate_candidate_text(
                user_text=user_text,
                tool_context=outcome.context_text or None,
                dashboard=True,
                will_auto_image=has_canvas_image,
                task=task,
            )
            task.result = {"ok": True, "text": candidate_text, "blocks": blocks}

            attempt = 0
            while True:
                attempt += 1
                await self._transition(task, TaskStatus.qc_review, "QC review in progress.")
                logger.info("[cid=%s task_id=%s] stage=qc_review attempt=%s", cid, tid, attempt)
                await asyncio.sleep(0.4)

                qc = await qc_service.review(task, attempt=attempt)
                with db_session() as session:
                    repo = LogRepository(session)
                    repo.add_qc_audit(
                        task_id=task.task_id,
                        attempt_number=attempt,
                        approved=qc.approved,
                        feedback=qc.feedback,
                    )
                if qc.approved:
                    with db_session() as session:
                        repo = LogRepository(session)
                        repo.set_final_result(
                            task_id=task.task_id,
                            final_result=_result_for_db(task.result),
                        )
                    # For frontend wiring: send the final CEO output as the status message.
                    final_text = str((task.result or {}).get("text") or "Approved.")
                    await self._transition(task, TaskStatus.complete, final_text)
                    logger.info("[cid=%s task_id=%s] stage=complete attempt=%s", cid, tid, attempt)
                    break

                # Rejected: send specific event, then mark needs_revision.
                await ws_manager.broadcast(
                    event="qc_rejection",
                    payload={
                        "task_id": tid,
                        "correlation_id": cid,
                        "reason": qc.feedback,
                        "attempt": attempt,
                    },
                )
                await self._transition(task, TaskStatus.needs_revision, "QC rejected. Revision required.")
                logger.info("[cid=%s task_id=%s] stage=needs_revision attempt=%s", cid, tid, attempt)

                if attempt >= _QC_MAX_ATTEMPTS:
                    with db_session() as session:
                        repo = LogRepository(session)
                        repo.set_final_result(
                            task_id=task.task_id,
                            final_result=_result_for_db(task.result),
                        )
                    await self._transition(task, TaskStatus.failed, "QC rejected too many times. Task failed.")
                    logger.info("[cid=%s task_id=%s] stage=failed qc_attempts=%s", cid, tid, attempt)
                    break

                # Mock a revision cycle (until agents exist).
                await asyncio.sleep(0.6)
                prev = task.result if isinstance(task.result, dict) else {}
                prev_blocks = prev.get("blocks")
                if not isinstance(prev_blocks, list):
                    prev_blocks = []
                revised_text = await self._generate_candidate_text(
                    user_text=f"{user_text}\n\nQC feedback: {qc.feedback}",
                    dashboard=True,
                    will_auto_image=any(
                        isinstance(b, dict)
                        and str(b.get("type") or "").lower() == "image"
                        and str(b.get("src") or b.get("url") or b.get("data_url") or "").strip()
                        for b in prev_blocks
                    ),
                    task=task,
                )
                task.result = {
                    "ok": True,
                    "text": revised_text,
                    "blocks": list(prev_blocks),
                }
        except Exception as exc:
            await self._transition(task, TaskStatus.failed, "Task failed.")
            logger.exception("[cid=%s task_id=%s] stage=failed err=%s", cid, tid, str(exc)[:200])

    async def _transition(self, task: Task, status: TaskStatus, message: str) -> None:
        task.status = status
        with db_session() as session:
            repo = LogRepository(session)
            repo.update_task_status(task_id=task.task_id, status=task.status.value)
            repo.add_task_status_event(
                task_id=task.task_id,
                correlation_id=task.correlation_id,
                status=task.status.value,
                message=message,
            )
        await self._broadcast(task, message=message)

    async def _broadcast(self, task: Task, *, message: str) -> None:
        """
        Broadcast required event format:
        {"event":"task_status_change","payload":{"task_id":"...","status":"...","message":"..."},"timestamp":"..."}

        Traceability: include correlation_id in payload (and in logs elsewhere).
        """
        payload: dict[str, Any] = {
            "task_id": str(task.task_id),
            "correlation_id": str(task.correlation_id),
            "status": str(task.status.value),
            "message": message,
        }
        res = task.result
        if isinstance(res, dict):
            bl = res.get("blocks")
            if isinstance(bl, list) and len(bl) > 0:
                payload["blocks"] = bl
                try:
                    est = len(json.dumps(bl))
                    if est > 500_000:
                        logger.warning(
                            "task_status_change blocks payload ~%s bytes (task_id=%s); ensure WS max size is sufficient",
                            est,
                            payload.get("task_id"),
                        )
                except Exception:
                    pass
        await ws_manager.broadcast(event="task_status_change", payload=payload)


task_orchestrator = TaskOrchestrator()

