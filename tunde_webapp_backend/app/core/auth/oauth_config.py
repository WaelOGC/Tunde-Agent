"""OAuth2 provider configuration — read from environment."""
from __future__ import annotations

import os


def _get(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


class GoogleOAuthConfig:
    client_id: str = ""
    client_secret: str = ""
    scopes: list[str] = []
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
    token_url = "https://oauth2.googleapis.com/token"

    @classmethod
    def load(cls) -> "GoogleOAuthConfig":
        cfg = cls()
        cfg.client_id = _get("GOOGLE_CLIENT_ID")
        cfg.client_secret = _get("GOOGLE_CLIENT_SECRET")
        cfg.scopes = _get(
            "GOOGLE_SCOPES",
            "https://www.googleapis.com/auth/drive.readonly "
            "https://www.googleapis.com/auth/gmail.readonly",
        ).split()
        return cfg


class GitHubOAuthConfig:
    client_id: str = ""
    client_secret: str = ""
    scopes: list[str] = []
    auth_url = "https://github.com/login/oauth/authorize"
    token_url = "https://github.com/login/oauth/access_token"

    @classmethod
    def load(cls) -> "GitHubOAuthConfig":
        cfg = cls()
        cfg.client_id = _get("GITHUB_CLIENT_ID")
        cfg.client_secret = _get("GITHUB_CLIENT_SECRET")
        cfg.scopes = _get("GITHUB_SCOPES", "repo read:user").split()
        return cfg


def get_callback_url(provider: str) -> str:
    if provider == "google":
        explicit = _get("GOOGLE_REDIRECT_URI")
        if explicit:
            return explicit.rstrip("/")
    base = _get("TUNDE_WEBAPP_PUBLIC_URL", "http://localhost:8001").rstrip("/")
    return f"{base}/auth/{provider}/callback"


def get_success_redirect() -> str:
    return _get("OAUTH_SUCCESS_REDIRECT", "http://localhost:5173/integrations?status=connected")


def get_failure_redirect() -> str:
    return _get("OAUTH_FAILURE_REDIRECT", "http://localhost:5173/integrations?status=error")
