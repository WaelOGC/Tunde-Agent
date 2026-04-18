from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from tunde_webapp_backend.app.models.published_page import PublishedPage


def create_published_page(
    session: Session,
    *,
    user_id: str,
    title: str,
    html_document: str,
) -> PublishedPage:
    row = PublishedPage(
        user_id=str(user_id or "anonymous")[:128],
        title=(title or "Tunde Report")[:512],
        html_document=html_document,
    )
    session.add(row)
    session.flush()
    return row


def get_published_page(session: Session, page_id: uuid.UUID) -> PublishedPage | None:
    return session.scalar(select(PublishedPage).where(PublishedPage.page_id == page_id))


def row_to_public_dict(row: PublishedPage) -> dict[str, Any]:
    return {
        "page_id": str(row.page_id),
        "title": row.title,
        "html_document": row.html_document,
        "created_at": row.created_at.isoformat() if row.created_at else "",
    }
