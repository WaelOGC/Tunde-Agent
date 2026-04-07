"""Identity core must be present in LLM system prompts (injection resistance)."""

from __future__ import annotations

from tunde_agent.services.prompt_manager import PromptManager


def test_system_prompt_includes_developer_and_forbidden_vendors() -> None:
    sp = PromptManager().system_prompt()
    assert "Wael Safan" in sp
    assert "NewFinity" in sp
    assert "Google" in sp and "OpenAI" in sp
    assert "Tunde AI Agent" in sp
    assert "I was developed by Wael Safan from NewFinity! 🌸" in sp
    assert "Never apologize for being an AI" in sp or "never apologize" in sp.lower()
    assert "feasibility study" in sp.lower() and "market analysis" in sp.lower()
