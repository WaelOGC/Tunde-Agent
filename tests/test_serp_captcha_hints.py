"""SERP HTML heuristics for captcha / rate-limit detection."""

from __future__ import annotations

from tunde_agent.tools.browser import google_search as gs


def test_serp_hints_detect_captcha_snippet() -> None:
    html = "<html><body>unusual traffic from your computer network</body></html>"
    assert gs.serp_html_suggests_blocked_search(html)


def test_serp_hints_detect_recaptcha() -> None:
    html = "<div class='g-recaptcha'></div>"
    assert gs.serp_html_suggests_blocked_search(html)


def test_clean_results_html_not_blocked() -> None:
    html = "<html><body><div id='rso'>organic</div></body></html>"
    assert not gs.serp_html_suggests_blocked_search(html)
