"""
OAuth2 routes for Google and GitHub integrations.

GET /auth/google/start   → redirects to Google consent
GET /auth/google/callback → exchanges code, saves tokens, redirects to frontend
GET /auth/github/start   → redirects to GitHub consent
GET /auth/github/callback → exchanges code, saves tokens, redirects to frontend

State tokens are stored in a simple in-memory dict for development.
Replace with Redis or DB-backed storage for production multi-instance deployments.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

from tunde_webapp_backend.app.core.auth import google_auth, github_auth
from tunde_webapp_backend.app.core.auth.oauth_config import (
    get_failure_redirect,
    get_success_redirect,
)
from tunde_webapp_backend.app.core.auth.token_store import delete_tokens, save_tokens

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["oauth"])

# In-memory state store (CSRF protection). Maps state_token → user_id.
# For production: replace with Redis TTL keys or DB rows.
_pending_states: dict[str, str] = {}

# For now, we use a fixed dev user ID until proper web auth is wired up.
# Replace with the real authenticated user_id from your session/JWT later.
_DEV_USER_ID = "dev_user"


# ── Google ──────────────────────────────────────────────────────────────────


@router.get("/google/start")
def google_start():
    """Redirect the user to Google's OAuth consent screen."""
    state = google_auth.generate_state_token()
    _pending_states[state] = _DEV_USER_ID
    url = google_auth.build_authorization_url(state=state)
    return RedirectResponse(url)


@router.get("/google/callback")
def google_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Handle Google's redirect after user consents (or denies)."""
    if error:
        logger.warning("Google OAuth error: %s", error)
        return RedirectResponse(get_failure_redirect())

    if not code or not state or state not in _pending_states:
        raise HTTPException(status_code=400, detail="Invalid OAuth callback — missing code or state")

    user_id = _pending_states.pop(state)

    try:
        tokens = google_auth.exchange_code_for_tokens(code)
        save_tokens(user_id=user_id, provider="google", tokens=tokens)
        logger.info("Google integration connected for user %s", user_id)
    except Exception as exc:
        logger.error("Google token exchange failed: %s", exc)
        return RedirectResponse(get_failure_redirect())

    return RedirectResponse(get_success_redirect())


@router.delete("/google/disconnect")
def google_disconnect():
    """Remove stored Google tokens (user disconnects integration)."""
    delete_tokens(user_id=_DEV_USER_ID, provider="google")
    return {"status": "disconnected", "provider": "google"}


# ── GitHub ───────────────────────────────────────────────────────────────────


@router.get("/github/start")
def github_start():
    """Redirect the user to GitHub's OAuth consent screen."""
    state = github_auth.generate_state_token()
    _pending_states[state] = _DEV_USER_ID
    url = github_auth.build_authorization_url(state=state)
    return RedirectResponse(url)


@router.get("/github/callback")
def github_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Handle GitHub's redirect after user consents (or denies)."""
    if error:
        logger.warning("GitHub OAuth error: %s", error)
        return RedirectResponse(get_failure_redirect())

    if not code or not state or state not in _pending_states:
        raise HTTPException(status_code=400, detail="Invalid OAuth callback — missing code or state")

    user_id = _pending_states.pop(state)

    try:
        tokens = github_auth.exchange_code_for_tokens(code)
        save_tokens(user_id=user_id, provider="github", tokens=tokens)
        logger.info("GitHub integration connected for user %s", user_id)
    except Exception as exc:
        logger.error("GitHub token exchange failed: %s", exc)
        return RedirectResponse(get_failure_redirect())

    return RedirectResponse(get_success_redirect())


@router.delete("/github/disconnect")
def github_disconnect():
    """Remove stored GitHub tokens (user disconnects integration)."""
    delete_tokens(user_id=_DEV_USER_ID, provider="github")
    return {"status": "disconnected", "provider": "github"}
