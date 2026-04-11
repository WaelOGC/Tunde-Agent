"""``DATABASE_URL`` normalization and dialect helpers for SQLAlchemy engines."""

from __future__ import annotations

from sqlalchemy.engine import make_url


def normalize_database_url(url: str) -> str:
    """
    Trim whitespace and pick a Docker-friendly MySQL driver when the URL has no driver.

    ``mysql://`` and ``mariadb://`` become ``mysql+pymysql://`` so slim images do not need
    ``libmysqlclient`` or ``mysqlclient`` build tooling. Explicit schemes like
    ``mysql+mysqlconnector://`` are left unchanged.
    """
    raw = url.strip()
    if not raw:
        msg = "DATABASE_URL must be a non-empty string"
        raise ValueError(msg)

    scheme, sep, rest = raw.partition("://")
    if not sep:
        return raw

    key = scheme.lower()
    if key == "mysql":
        return f"mysql+pymysql://{rest}"
    if key == "mariadb":
        return f"mysql+pymysql://{rest}"
    return raw


def engine_connect_args(url: str) -> dict[str, str]:
    """Dialect-specific defaults for ``create_engine(..., connect_args=...)``."""
    try:
        parsed = make_url(url)
    except Exception:
        return {}
    if parsed.drivername.startswith("mysql"):
        return {"charset": "utf8mb4"}
    return {}
