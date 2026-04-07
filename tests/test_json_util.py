"""LLM JSON repair and agent fallbacks."""

from __future__ import annotations

import json

import pytest

from tunde_agent.services.research_orchestration.json_util import (
    parse_llm_json_for_agent,
    parse_llm_json_object,
)


def test_parse_trailing_comma() -> None:
    raw = '{"a": 1, "b": 2,}'
    d = parse_llm_json_object(raw)
    assert d == {"a": 1, "b": 2}


def test_parse_embedded_in_prose() -> None:
    raw = 'Here you go:\n```json\n{"x": "y"}\n```\nThanks'
    d = parse_llm_json_object(raw)
    assert d == {"x": "y"}


def test_parse_llm_json_for_agent_analyst_fallback() -> None:
    d = parse_llm_json_for_agent("not json at all", "analyst")
    assert "_parse_fallback" in d
    assert "executive_summary" in d
    assert isinstance(d["insights"], list)


def test_parse_strict_raises() -> None:
    with pytest.raises(json.JSONDecodeError):
        parse_llm_json_object("no braces here")
