"""Designer chart kind inference and coercion."""

from __future__ import annotations

from tunde_agent.services.research_orchestration import designer_agent as d


def test_infer_time_series_prefers_area() -> None:
    labels = ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024"]
    values = [1.0, 2.0, 3.0, 2.5]
    assert d._infer_chart_kind(labels, values, None, None) == "area"


def test_infer_small_share_prefers_polar_not_pie_by_default() -> None:
    labels = ["A", "B", "C"]
    values = [30.0, 45.0, 25.0]
    assert d._infer_chart_kind(labels, values, None, None) == "polarArea"


def test_infer_share_respects_explicit_pie_hint() -> None:
    labels = ["A", "B", "C"]
    values = [30.0, 45.0, 25.0]
    assert d._infer_chart_kind(labels, values, None, "pie chart composition") == "doughnut"


def test_secondary_forces_grouped_bar() -> None:
    labels = ["X", "Y"]
    values = [1.0, 2.0]
    sec = [3.0, 4.0]
    assert d._infer_chart_kind(labels, values, sec, "bar") == "grouped_bar"


def test_coerce_single_point_bar() -> None:
    spec = d._coerce_chart_spec(
        {"chart_metrics": {"title": "One", "labels": ["A"], "values": [42]}}
    )
    assert spec is not None
    assert spec["chart_kind"] == "bar"


def test_build_quickchart_url_requires_valid_config() -> None:
    out = d.build_quickchart_png_url(
        {"chart_metrics": {"labels": ["x", "y"], "values": [1, 2]}},
        theme_topic="solar",
    )
    assert out is not None
    url, spec = out
    assert "quickchart.io" in url
    assert spec["chart_kind"]


def test_has_chartable_metrics() -> None:
    assert d.has_chartable_metrics({"chart_metrics": {"labels": ["a"], "values": [1]}})
    assert d.has_chartable_metrics(
        {"analyst_chart_metrics": {"labels": ["a", "b"], "values": [3, 4]}}
    )
    assert not d.has_chartable_metrics({})


def test_coerce_spec_includes_intel() -> None:
    spec = d._coerce_chart_spec(
        {
            "chart_metrics": {
                "title": "T",
                "labels": ["a", "b"],
                "values": [1, 2],
                "intelligence_caption": "Shows growth.",
                "chart_kind": "radar",
            }
        }
    )
    assert spec is not None
    assert spec["chart_kind"] == "radar"
    assert "growth" in spec["intelligence_caption"]


def test_build_quickchart_png_url_from_chartjs_minimal() -> None:
    cfg = {
        "type": "bar",
        "data": {"labels": ["A"], "datasets": [{"label": "x", "data": [1]}]},
        "options": {},
    }
    url = d.build_quickchart_png_url_from_chartjs(cfg)
    assert url
    assert "quickchart.io" in url


def test_build_landing_page_contains_topic() -> None:
    from tunde_agent.services.report_html import build_landing_page_html

    html = build_landing_page_html(
        "Battery market outlook",
        {
            "tagline": "Test",
            "executive_summary": "Hello world.",
            "insights": ["🌍 Global note", "Local detail"],
            "sources": [("Ex", "https://example.com")],
        },
        illustrations=[],
        chart_embeds=[],
        rtl=False,
        public_page_url="http://localhost:8000/reports/view/x",
    )
    assert "Battery market outlook" in html
    assert "Global perspectives" in html
    assert "Inter" in html
    assert "app-frame" in html
    assert "tunde-sidebar" in html
    assert "Copyright © 2026 Tunde AI Agent" in html
    assert "Wael Safan" in html and "NewFinity" in html
