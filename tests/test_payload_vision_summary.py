"""payload helpers for vision delivery fields."""

from __future__ import annotations

import json

from tunde_agent.services.research_orchestration.payload import (
    image_analysis_summary_from_vision,
    normalize_multilingual_sources,
)


def test_image_analysis_summary_from_readings() -> None:
    raw = json.dumps(
        {
            "readings": [
                {
                    "kind": "chart",
                    "summary": "Revenue by quarter",
                    "data_points": [{"label": "Q1", "value": "12"}],
                }
            ]
        },
        separators=(",", ":"),
    )
    s = image_analysis_summary_from_vision(raw)
    assert "Revenue" in s
    assert "Q1" in s


def test_normalize_multilingual_sources_strips() -> None:
    rows = normalize_multilingual_sources(
        [
            {"url": "https://a.example/x", "search_locale": "zh-CN/cn", "role": "serp"},
            {"bad": True},
        ]
    )
    assert len(rows) == 1
    assert rows[0]["url"].startswith("https://a.example")
