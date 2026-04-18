"""
GitHub OAuth2 — authorization URL builder + token exchange.

Flow:
  1. /auth/github/start  → redirect user to GitHub consent screen
  2. GitHub redirects to /auth/github/callback?code=...&state=...
  3. Backend exchanges code for token, encrypts, saves to DB
"""
from __future__ import annotations

import secrets
import urllib.parse

import httpx

from tunde_webapp_backend.app.core.auth.oauth_config import GitHubOAuthConfig, get_callback_url


def build_authorization_url(state: str) -> str:
    """Return the GitHub OAuth2 consent URL."""
    cfg = GitHubOAuthConfig.load()
    params = {
        "client_id": cfg.client_id,
        "redirect_uri": get_callback_url("github"),
        "scope": " ".join(cfg.scopes),
        "state": state,
    }
    return cfg.auth_url + "?" + urllib.parse.urlencode(params)


def exchange_code_for_tokens(code: str) -> dict:
    """
    Exchange an authorization code for a GitHub access token.
    Returns the full token response dict from GitHub.
    Raises httpx.HTTPStatusError on failure.
    """
    cfg = GitHubOAuthConfig.load()
    response = httpx.post(
        cfg.token_url,
        headers={"Accept": "application/json"},
        data={
            "client_id": cfg.client_id,
            "client_secret": cfg.client_secret,
            "code": code,
            "redirect_uri": get_callback_url("github"),
        },
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def generate_state_token() -> str:
    """Generate a cryptographically random state token for CSRF protection."""
    return secrets.token_urlsafe(32)
