from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any, Callable, Coroutine

from tunde_webapp_backend.app.task_models import Task
from tunde_webapp_backend.app.tools.base import ToolRunOutcome
from tunde_webapp_backend.app.tools.data_analysis_tool import analyze_tabular_text
from tunde_webapp_backend.app.tools.image_tool import build_infographic_prompt, generate_workspace_image
from tunde_webapp_backend.app.tools.file_analyst_tool import planning_augmentation, tool_context_markdown
from tunde_webapp_backend.app.tools.file_store import get_registered_file
from tunde_webapp_backend.app.tools.planner import ToolPlan, _normalize_order, merge_plan_with_heuristic, plan_tools
from tunde_webapp_backend.app.tools.search_tool import format_research_for_llm, search_web

logger = logging.getLogger(__name__)

Emit = Callable[..., Coroutine[Any, Any, None]]


class ToolsManager:
    """
    Dashboard tools: research, tabular analysis, file analyst uploads, image generation.
    Emits ``tool_activity`` for live UI updates.
    """

    async def _emit(
        self,
        emit: Emit | None,
        task: Task,
        message: str,
        *,
        tool: str | None = None,
        phase: str | None = None,
    ) -> None:
        if emit is None:
            return
        await emit(message, tool=tool, phase=phase)

    def _enabled_map(self, payload: dict[str, Any] | None) -> dict[str, bool]:
        raw = (payload or {}).get("enabled_tools")
        if not isinstance(raw, dict):
            return {"search": True, "analysis": False, "vision": False, "memory": False, "file_analyst": False}

        def _b(key: str, default: bool = False) -> bool:
            v = raw.get(key)
            if isinstance(v, bool):
                return v
            return default

        return {
            "search": _b("search", True),
            "analysis": _b("analysis", False),
            "vision": _b("vision", False),
            "memory": _b("memory", False),
            "file_analyst": _b("file_analyst", False),
        }

    async def run_research_and_data(
        self,
        *,
        task: Task,
        user_text: str,
        emit: Emit | None = None,
    ) -> ToolRunOutcome:
        """
        Run web research and/or data analysis (before the main LLM reply).
        Returns context text for the LLM plus any structured ``table`` blocks for the UI.
        """
        payload = task.payload if isinstance(task.payload, dict) else {}
        enabled = self._enabled_map(payload)
        parts: list[str] = []
        blocks: list[dict[str, Any]] = []

        file_meta: dict[str, Any] | None = None
        fc = payload.get("file_context")
        if enabled.get("file_analyst") and isinstance(fc, dict):
            fid = fc.get("file_id")
            uid = str(payload.get("user_id") or "anonymous")
            if fid:
                file_meta = get_registered_file(str(fid), user_id=uid)
                if file_meta:
                    await self._emit(
                        emit,
                        task,
                        "[File Analyst] Using your uploaded file for this turn.",
                        tool="file_analyst",
                        phase="context",
                    )
                    parts.append(tool_context_markdown(file_meta))
                else:
                    await self._emit(
                        emit,
                        task,
                        "[File Analyst] File not found or expired — please upload again.",
                        tool="file_analyst",
                        phase="error",
                    )

        plan_user = user_text
        if file_meta:
            plan_user = f"{user_text}\n\n---\n{planning_augmentation(file_meta)}\n"

        plan = await plan_tools(plan_user)
        if file_meta and file_meta.get("tabular_csv"):
            merged_tools = _normalize_order([*plan.tools, "data_analysis"])
            plan = ToolPlan(
                tools=merged_tools,
                search_query=plan.search_query,
                image_prompt=plan.image_prompt,
                data_text=str(file_meta.get("tabular_csv") or "")[:50000],
                tool_use=True,
            )
            plan = merge_plan_with_heuristic(plan, plan_user)

        for tool_id in plan.tools:
            if tool_id == "image_generation":
                continue

            if tool_id == "web_research":
                if not enabled.get("search", True):
                    await self._emit(
                        emit,
                        task,
                        "Web research skipped (Search tool off).",
                        tool="web_research",
                        phase="skipped",
                    )
                    continue
                q = plan.search_query or user_text.strip()
                await self._emit(
                    emit,
                    task,
                    "[Search Tool] Executing SearchTool — querying the web…",
                    tool="web_research",
                    phase="search",
                )
                result = await search_web(q)
                await self._emit(
                    emit,
                    task,
                    "[Search Tool] Executing SearchTool — analyzing results…",
                    tool="web_research",
                    phase="analyze",
                )
                parts.append(format_research_for_llm(result))

            elif tool_id == "data_analysis":
                tabular_from_file = bool(file_meta and file_meta.get("tabular_csv"))
                if not enabled.get("analysis", False) and not tabular_from_file:
                    await self._emit(
                        emit,
                        task,
                        "Data analysis skipped (enable Analyze tool or attach a file in File Analyst).",
                        tool="data_analysis",
                        phase="skipped",
                    )
                    continue
                raw = (plan.data_text or "").strip() or user_text
                if tabular_from_file:
                    raw = str(file_meta.get("tabular_csv") or "")
                await self._emit(
                    emit,
                    task,
                    "[Data Tool] Executing DataTool — analyzing tabular data…",
                    tool="data_analysis",
                    phase="analyze",
                )
                ctx, tbl = analyze_tabular_text(raw)
                if ctx:
                    parts.append(ctx)
                if tbl:
                    blocks.append(tbl)
                elif not ctx:
                    await self._emit(
                        emit,
                        task,
                        "No tabular data detected in this message.",
                        tool="data_analysis",
                        phase="empty",
                    )

        if enabled.get("memory", False):
            await self._emit(emit, task, "Memory tool: coming soon.", tool="memory", phase="stub")

        return ToolRunOutcome(
            context_text="\n\n".join(p for p in parts if p.strip()),
            blocks=blocks,
            plan=plan,
        )

    async def generate_image_if_planned(
        self,
        *,
        task: Task,
        plan: ToolPlan,
        user_text: str,
        reply_text: str,
        emit: Emit | None = None,
    ) -> list[dict[str, Any]]:
        """Run workspace image generation when planned and the Image tool is enabled."""
        payload = task.payload if isinstance(task.payload, dict) else {}
        enabled = self._enabled_map(payload)
        if "image_generation" not in plan.tools:
            return []
        if not enabled.get("vision", True):
            await self._emit(
                emit,
                task,
                "[Image Tool] Skipped (Image disabled in Tools menu).",
                tool="image_generation",
                phase="skipped",
            )
            return []

        await self._emit(
            emit,
            task,
            "[Image Tool] Executing ImageTool — generating image…",
            tool="image_generation",
            phase="generate",
        )
        ig = payload.get("image_generation")
        if ig is not None and not isinstance(ig, dict):
            ig = None
        prompt = build_infographic_prompt(
            user_text=user_text,
            plan_image_prompt=plan.image_prompt,
            reply_summary=reply_text,
            image_generation=ig,
        )
        try:
            raw, mime = await asyncio.to_thread(generate_workspace_image, prompt=prompt)
        except Exception as exc:
            logger.warning("Image generation failed: %s", str(exc)[:200])
            msg = str(exc).strip()[:400] or "Image generation failed."
            await self._emit(
                emit,
                task,
                f"Image generation failed: {msg[:120]}",
                tool="image_generation",
                phase="error",
            )
            return [{"type": "image_error", "message": msg}]

        b64 = base64.standard_b64encode(raw).decode("ascii")
        data_url = f"data:{mime};base64,{b64}"
        await self._emit(
            emit,
            task,
            "[Image Tool] Image ready.",
            tool="image_generation",
            phase="complete",
        )
        return [
            {
                "type": "image",
                "alt": "Generated image",
                "src": data_url,
            }
        ]


tools_manager = ToolsManager()
