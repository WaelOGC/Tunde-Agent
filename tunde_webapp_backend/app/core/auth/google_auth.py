"""
Google OAuth2 — authorization URL builder + token exchange.

Flow:
  1. /auth/google/start  → redirect user to Google consent screen
  2. Google redirects to /auth/google/callback?code=...&state=...
  3. Backend exchanges code for tokens, encrypts, saves to DB
"""
from __future__ import annotations

import secrets
import urllib.parse

import httpx

from tunde_webapp_backend.app.core.auth.oauth_config import GoogleOAuthConfig, get_callback_url


def build_authorization_url(state: str) -> str:
    """Return the Google OAuth2 consent URL."""
    cfg = GoogleOAuthConfig.load()
    params = {
        "client_id": cfg.client_id,
        "redirect_uri": get_callback_url("google"),
        "response_type": "code",
        "scope": " ".join(cfg.scopes),
        "state": state,
        "access_type": "offline",  # request refresh_token
        "prompt": "consent",  # always show consent to get refresh_token
    }
    return cfg.auth_url + "?" + urllib.parse.urlencode(params)


def exchange_code_for_tokens(code: str) -> dict:
    """
    Exchange an authorization code for access + refresh tokens.
    Returns the full token response dict from Google.
    Raises httpx.HTTPStatusError on failure.
    """
    cfg = GoogleOAuthConfig.load()
    response = httpx.post(
        cfg.token_url,
        data={
            "code": code,
            "client_id": cfg.client_id,
            "client_secret": cfg.client_secret,
            "redirect_uri": get_callback_url("google"),
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def generate_state_token() -> str:
    """Generate a cryptographically random state token for CSRF protection."""
    return secrets.token_urlsafe(32)
