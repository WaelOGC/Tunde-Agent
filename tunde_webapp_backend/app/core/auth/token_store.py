"""
Encrypted OAuth token storage using the existing DB and ENCRYPTION_KEY.

Persists provider token payloads on ``UserIntegration`` (table ``user_integrations``):
the full token dict is Fernet-encrypted and stored in ``encrypted_access_token``.
``token_expires_at`` is set when the payload includes ``expires_in`` (e.g. Google).

If ENCRYPTION_KEY is not set, tokens are stored as plain JSON (dev only — log a warning).
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from tunde_webapp_backend.app.db import db_session, engine
from tunde_webapp_backend.app.models.base import Base
from tunde_webapp_backend.app.models.user_integration import UserIntegration

logger = logging.getLogger(__name__)

_FERNET = None


def _get_fernet():
    global _FERNET
    if _FERNET is not None:
        return _FERNET
    key = os.getenv("ENCRYPTION_KEY", "").strip()
    if not key:
        logger.warning("ENCRYPTION_KEY not set — OAuth tokens will be stored unencrypted (dev only)")
        return None
    try:
        from cryptography.fernet import Fernet

        _FERNET = Fernet(key.encode() if isinstance(key, str) else key)
        return _FERNET
    except Exception as exc:
        logger.error("Failed to initialize Fernet: %s", exc)
        return None


def _encrypt(data: dict) -> str:
    f = _get_fernet()
    raw = json.dumps(data).encode()
    if f is None:
        return raw.decode()
    return f.encrypt(raw).decode()


def _decrypt(blob: str) -> dict:
    f = _get_fernet()
    raw = blob.encode()
    if f is None:
        return json.loads(raw)
    return json.loads(f.decrypt(raw))


def ensure_table() -> None:
    """Ensure ``user_integrations`` exists (idempotent; same as model metadata)."""
    Base.metadata.create_all(bind=engine, tables=[UserIntegration.__table__])


def save_tokens(user_id: str, provider: str, tokens: dict) -> None:
    """Encrypt and upsert tokens for a user+provider pair."""
    ensure_table()
    now = datetime.now(timezone.utc)
    encrypted = _encrypt(tokens)
    expires_at: datetime | None = None
    exp = tokens.get("expires_in")
    if exp is not None:
        try:
            expires_at = now + timedelta(seconds=int(exp))
        except (TypeError, ValueError):
            pass

    with db_session() as session:
        row = session.execute(
            select(UserIntegration).where(
                UserIntegration.user_id == user_id,
                UserIntegration.provider == provider,
            )
        ).scalar_one_or_none()
        if row is None:
            session.add(
                UserIntegration(
                    user_id=user_id,
                    provider=provider,
                    encrypted_access_token=encrypted,
                    encrypted_refresh_token=None,
                    token_expires_at=expires_at,
                    created_at=now,
                    updated_at=now,
                )
            )
        else:
            row.encrypted_access_token = encrypted
            row.encrypted_refresh_token = None
            row.token_expires_at = expires_at
            row.updated_at = now


def load_tokens(user_id: str, provider: str) -> dict | None:
    """Return decrypted tokens or None if not found."""
    ensure_table()
    with db_session() as session:
        row = session.execute(
            select(UserIntegration).where(
                UserIntegration.user_id == user_id,
                UserIntegration.provider == provider,
            )
        ).scalar_one_or_none()
    if row is None:
        return None
    return _decrypt(row.encrypted_access_token)


def delete_tokens(user_id: str, provider: str) -> None:
    """Remove stored tokens (user disconnected integration)."""
    ensure_table()
    with db_session() as session:
        session.execute(
            delete(UserIntegration).where(
                UserIntegration.user_id == user_id,
                UserIntegration.provider == provider,
            )
        )
