"""
Serve saved landing-page HTML reports from ``data/reports/{uuid}.html``.

Reports are **not** exposed as a blind static file mount: this route validates the UUID, sets
``Content-Type: text/html``, and reads from ``reports_dir()`` (same path the mission writer uses).
In Docker, mount ``./data:/app/data`` so written files and this handler share the volume.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from tunde_agent.services.report_html import reports_dir

router = APIRouter(tags=["reports"])


@router.get("/reports/view/{report_id}")
def view_report(report_id: str) -> HTMLResponse:
    """
    Return the self-contained HTML report for a mission-generated ``report_id`` (UUID).

    Files are written by ``mission_service`` after a successful approved delivery.
    Served as inline HTML (never ``Content-Disposition: attachment``) so browsers render the page.
    """
    try:
        uuid.UUID(report_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid report id") from exc
    path = reports_dir() / f"{report_id}.html"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Report not found or expired")
    body = path.read_text(encoding="utf-8")
    return HTMLResponse(content=body, media_type="text/html; charset=utf-8")
