from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from tunde_webapp_backend.app.tools.file_analyst_tool import FileAnalystError, ingest_file
from tunde_webapp_backend.app.tools.file_store import save_uploaded_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload")
async def upload_file(
    user_id: str = Form("anonymous"),
    file: UploadFile = File(...),
) -> dict:
    """Accept a validated upload and return metadata for the chat UI + later task payloads."""
    filename = file.filename or "upload"
    try:
        raw = await file.read()
    except Exception as exc:
        logger.warning("upload read failed: %s", exc)
        raise HTTPException(status_code=400, detail="Could not read upload.") from exc
    try:
        ingest = ingest_file(filename=filename, content=raw)
    except FileAnalystError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("ingest failed")
        raise HTTPException(status_code=500, detail="Could not process file.") from exc

    fid = save_uploaded_bytes(
        user_id=str(user_id or "anonymous"),
        filename=filename,
        content=raw,
        ingest=ingest,
    )
    return {
        "file_id": fid,
        "filename": filename,
        "size": len(raw),
        "kind": ingest["kind"],
        "summary": ingest["summary"],
    }
