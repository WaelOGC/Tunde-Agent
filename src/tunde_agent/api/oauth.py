"""
Google and GitHub OAuth2 (authorization code flow).

This repo ships **FastAPI + Authlib** on port 8000 (Docker / uvicorn). That matches the same
env vars and callback URLs you would configure for **Passport.js** ``GoogleStrategy`` /
``GitHubStrategy`` in an Express app; see ``integrations/passport-reference/src/config/passport.js``.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

import httpx
from authlib.integrations.base_client import OAuthError as AuthlibOAuthError
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from tunde_agent.config.settings import get_settings
from tunde_agent.db.privileged_session import privileged_db_session
from tunde_agent.models.encrypted_data import EncryptedData
from tunde_agent.models.user import User
from tunde_agent.services.oauth_token_crypto import encrypt_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["oauth"])

_oauth_singleton: OAuth | None = None

KEY_GOOGLE_REFRESH = "oauth_google_refresh_token"
KEY_GOOGLE_ACCESS = "oauth_google_access_token"
KEY_GITHUB_REFRESH = "oauth_github_refresh_token"
KEY_GITHUB_ACCESS = "oauth_github_access_token"


def get_oauth_client() -> OAuth:
    global _oauth_singleton
    if _oauth_singleton is None:
        s = get_settings()
        client = OAuth()
        client.register(
            name="google",
            client_id=s.google_client_id,
            client_secret=s.google_client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={
                "scope": (
                    "openid email profile "
                    "https://www.googleapis.com/auth/drive.file "
                    "https://www.googleapis.com/auth/gmail.modify"
                ),
            },
        )
        client.register(
            name="github",
            client_id=s.github_client_id,
            client_secret=s.github_client_secret,
            access_token_url="https://github.com/login/oauth/access_token",
            authorize_url="https://github.com/login/oauth/authorize",
            api_base_url="https://api.github.com/",
            client_kwargs={"scope": "user repo"},
        )
        _oauth_singleton = client
    return _oauth_singleton


def _success_redirect() -> RedirectResponse:
    s = get_settings()
    base = (s.public_base_url or "").strip().rstrip("/") or "http://localhost:5173"
    resp = RedirectResponse(url=f"{base}/")
    return resp


def _upsert_encrypted_secret(
    session,
    user_id: uuid.UUID,
    key_name: str,
    plaintext: str | None,
    secret: str,
) -> None:
    if not plaintext:
        return
    blob = encrypt_token(plaintext, secret)
    row = session.scalar(
        select(EncryptedData).where(
            EncryptedData.user_id == user_id,
            EncryptedData.key_name == key_name,
        )
    )
    if row is None:
        session.add(EncryptedData(user_id=user_id, key_name=key_name, encrypted_value=blob))
    else:
        row.encrypted_value = blob


def _find_or_create_google_user(session, email: str, sub: str, display_name: str | None) -> User:
    u = session.scalar(select(User).where(User.google_sub == sub))
    if u is not None:
        return u
    u = session.scalar(select(User).where(User.email == email))
    if u is not None:
        u.google_sub = sub
        if display_name and not u.display_name:
            u.display_name = display_name
        return u
    user = User(email=email, hashed_password=None, google_sub=sub, display_name=display_name)
    session.add(user)
    session.flush()
    return user


def _find_or_create_github_user(
    session,
    email: str | None,
    github_id: str,
    display_name: str | None,
) -> User:
    u = session.scalar(select(User).where(User.github_id == github_id))
    if u is not None:
        return u
    resolved_email = (email or "").strip()
    if resolved_email:
        u = session.scalar(select(User).where(User.email == resolved_email))
        if u is not None:
            u.github_id = github_id
            if display_name and not u.display_name:
                u.display_name = display_name
            return u
    if not resolved_email:
        resolved_email = f"github-{github_id}@users.noreply.github.com"
    user = User(
        email=resolved_email,
        hashed_password=None,
        github_id=github_id,
        display_name=display_name,
    )
    session.add(user)
    session.flush()
    return user


@router.get("/google")
async def auth_google_start(request: Request):
    s = get_settings()
    if not s.google_client_id or not s.google_client_secret:
        raise HTTPException(status_code=503, detail="Google OAuth is not configured (missing client id/secret).")
    # Prime session so the signed cookie is established on the same host the browser uses
    # (avoids losing OAuth state when the cookie was never set for this origin).
    request.session.setdefault("_oauth", True)
    return await get_oauth_client().google.authorize_redirect(
        request,
        s.google_redirect_uri,
        access_type="offline",
        prompt="consent",
    )


@router.get("/google/callback")
async def auth_google_callback(request: Request):
    s = get_settings()
    if not s.tunde_encryption_key.strip():
        raise HTTPException(status_code=503, detail="TUNDE_ENCRYPTION_KEY is required to store OAuth tokens.")
    try:
        token = await get_oauth_client().google.authorize_access_token(request)
    except AuthlibOAuthError as exc:
        if getattr(exc, "error", None) == "mismatching_state":
            logger.warning("Google OAuth state mismatch (session cookie missing or wrong host).")
            raise HTTPException(
                status_code=400,
                detail=(
                    "OAuth state mismatch: use the same host you configured in GOOGLE_REDIRECT_URI "
                    "(e.g. if the redirect is http://127.0.0.1:8000/..., open "
                    "http://127.0.0.1:8000/api/auth/google — not localhost). Clear cookies and retry."
                ),
            ) from exc
        logger.warning("Google OAuth callback error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc.description or exc)) from exc
    except Exception as exc:
        logger.warning("Google OAuth callback error: %s", exc)
        raise HTTPException(status_code=400, detail="Google OAuth failed.") from exc

    user_info: dict[str, Any] | None = token.get("userinfo")
    if user_info is None:
        access = token.get("access_token")
        if not access:
            raise HTTPException(status_code=400, detail="Google token response missing access_token.")
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access}"},
                timeout=30.0,
            )
            r.raise_for_status()
            user_info = r.json()

    email = (user_info.get("email") or "").strip()
    sub = (user_info.get("sub") or "").strip()
    if not email or not sub:
        raise HTTPException(status_code=400, detail="Google profile missing email or sub.")
    name = (user_info.get("name") or "").strip() or None

    enc_secret = s.tunde_encryption_key
    try:
        with privileged_db_session() as session:
            user = _find_or_create_google_user(session, email, sub, name)
            _upsert_encrypted_secret(session, user.id, KEY_GOOGLE_ACCESS, token.get("access_token"), enc_secret)
            _upsert_encrypted_secret(session, user.id, KEY_GOOGLE_REFRESH, token.get("refresh_token"), enc_secret)
            # Copy PK before session closes — ORM instance is detached after commit.
            user_id = user.id
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    request.session["user_id"] = str(user_id)
    return _success_redirect()


@router.get("/github")
async def auth_github_start(request: Request):
    s = get_settings()
    if not s.github_client_id or not s.github_client_secret:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured (missing client id/secret).")
    request.session.setdefault("_oauth", True)
    return await get_oauth_client().github.authorize_redirect(request, s.github_redirect_uri)


@router.get("/github/callback")
async def auth_github_callback(request: Request):
    s = get_settings()
    if not s.tunde_encryption_key.strip():
        raise HTTPException(status_code=503, detail="TUNDE_ENCRYPTION_KEY is required to store OAuth tokens.")
    try:
        token = await get_oauth_client().github.authorize_access_token(request)
    except AuthlibOAuthError as exc:
        if getattr(exc, "error", None) == "mismatching_state":
            logger.warning("GitHub OAuth state mismatch (session cookie missing or wrong host).")
            raise HTTPException(
                status_code=400,
                detail=(
                    "OAuth state mismatch: use the same host as GITHUB_REDIRECT_URI "
                    "(127.0.0.1 vs localhost must match). Clear cookies and retry."
                ),
            ) from exc
        logger.warning("GitHub OAuth callback error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc.description or exc)) from exc
    except Exception as exc:
        logger.warning("GitHub OAuth callback error: %s", exc)
        raise HTTPException(status_code=400, detail="GitHub OAuth failed.") from exc

    gh = get_oauth_client()
    try:
        resp = await gh.github.get("user", token=token)
        profile = resp.json()
    except Exception as exc:
        logger.warning("GitHub user profile error: %s", exc)
        raise HTTPException(status_code=400, detail="Could not load GitHub profile.") from exc

    github_id = str(profile.get("id") or "").strip()
    if not github_id:
        raise HTTPException(status_code=400, detail="GitHub profile missing id.")
    display_name = (profile.get("name") or profile.get("login") or "").strip() or None
    email = (profile.get("email") or "").strip() or None
    if email is None:
        try:
            er = await gh.github.get("user/emails", token=token)
            rows = er.json()
            if isinstance(rows, list):
                for row in rows:
                    if row.get("primary") and row.get("email"):
                        email = str(row["email"])
                        break
                if email is None and rows:
                    email = str(rows[0].get("email") or "")
        except Exception:
            email = None

    enc_secret = s.tunde_encryption_key
    try:
        with privileged_db_session() as session:
            user = _find_or_create_github_user(session, email, github_id, display_name)
            _upsert_encrypted_secret(session, user.id, KEY_GITHUB_ACCESS, token.get("access_token"), enc_secret)
            _upsert_encrypted_secret(session, user.id, KEY_GITHUB_REFRESH, token.get("refresh_token"), enc_secret)
            user_id = user.id
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    request.session["user_id"] = str(user_id)
    return _success_redirect()
