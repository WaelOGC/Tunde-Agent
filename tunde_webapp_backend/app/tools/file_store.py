from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_MAX_AGE_SEC = int((os.getenv("TUNDE_FILE_TTL_SEC") or "3600").strip())
_UPLOAD_SUBDIR = "tunde_webapp_uploads"

_lock = threading.Lock()
# file_id -> metadata (paths + ingest fields); binary kept on disk until TTL.
_registry: dict[str, dict[str, Any]] = {}


def upload_dir() -> Path:
    base = os.getenv("TUNDE_UPLOAD_DIR") or __import__("tempfile").gettempdir()
    p = Path(base) / _UPLOAD_SUBDIR
    p.mkdir(parents=True, exist_ok=True)
    return p


def _purge_stale_unlocked(now: float) -> None:
    dead: list[str] = []
    for fid, meta in _registry.items():
        created = float(meta.get("created") or 0)
        if now - created > _MAX_AGE_SEC:
            dead.append(fid)
    for fid in dead:
        meta = _registry.pop(fid, None)
        if not meta:
            continue
        path = meta.get("path")
        if isinstance(path, str) and path:
            try:
                Path(path).unlink(missing_ok=True)
            except OSError as exc:
                logger.debug("upload delete %s: %s", path, exc)


def save_uploaded_bytes(
    *,
    user_id: str,
    filename: str,
    content: bytes,
    ingest: dict[str, Any],
) -> str:
    """Write bytes to disk and register ingest metadata. Returns new file_id."""
    now = time.time()
    file_id = str(uuid.uuid4())
    safe_name = "".join(c for c in filename if c.isalnum() or c in "._- ")[:180] or "upload"
    path = upload_dir() / f"{file_id}_{safe_name}"
    path.write_bytes(content)
    with _lock:
        _purge_stale_unlocked(now)
        _registry[file_id] = {
            "file_id": file_id,
            "user_id": str(user_id or "anonymous"),
            "filename": filename,
            "size": len(content),
            "created": now,
            "path": str(path),
            **ingest,
        }
    return file_id


def get_registered_file(file_id: str, *, user_id: str) -> dict[str, Any] | None:
    """Return a copy of stored metadata if valid and not expired."""
    now = time.time()
    with _lock:
        _purge_stale_unlocked(now)
        meta = _registry.get(str(file_id))
        if not meta:
            return None
        if str(meta.get("user_id")) != str(user_id or "anonymous"):
            return None
        if now - float(meta.get("created") or 0) > _MAX_AGE_SEC:
            p = meta.get("path")
            _registry.pop(str(file_id), None)
            if isinstance(p, str):
                try:
                    Path(p).unlink(missing_ok=True)
                except OSError:
                    pass
            return None
        return dict(meta)
