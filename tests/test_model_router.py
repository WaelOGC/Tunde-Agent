"""TaskKind → provider routing (no live API calls)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from tunde_agent.multi_agent.model_router import TaskKind, resolve_llm_client, task_kind_for_research_role
from tunde_agent.services.llm_service import DeepSeekClient, GeminiClient, LLMError


def test_task_kind_for_roles() -> None:
    assert task_kind_for_research_role("verifier") == TaskKind.STRUCTURED_JSON
    assert task_kind_for_research_role("master_plan") == TaskKind.ORCHESTRATION_JSON
    assert task_kind_for_research_role("analyst") == TaskKind.RESEARCH_SYNTHESIS


def test_resolve_prefers_deepseek_for_structured_json() -> None:
    s = SimpleNamespace(
        gemini_api_key="gkey",
        gemini_model="gemini-2.5-flash",
        deepseek_api_key="dkey",
        deepseek_model="deepseek-chat",
        deepseek_base_url="https://api.deepseek.com",
    )
    client = resolve_llm_client(s, TaskKind.STRUCTURED_JSON)
    assert isinstance(client, DeepSeekClient)


def test_resolve_synthesis_prefers_gemini() -> None:
    s = SimpleNamespace(
        gemini_api_key="gkey",
        gemini_model="gemini-2.5-flash",
        deepseek_api_key="dkey",
        deepseek_model="deepseek-chat",
        deepseek_base_url="https://api.deepseek.com",
    )
    client = resolve_llm_client(s, TaskKind.RESEARCH_SYNTHESIS)
    assert isinstance(client, GeminiClient)


def test_resolve_raises_when_no_keys() -> None:
    s = SimpleNamespace(
        gemini_api_key="",
        gemini_model="gemini-2.5-flash",
        deepseek_api_key="",
        deepseek_model="deepseek-chat",
        deepseek_base_url="https://api.deepseek.com",
    )
    with pytest.raises(LLMError):
        resolve_llm_client(s, TaskKind.STRUCTURED_JSON)
