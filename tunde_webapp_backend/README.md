# Tunde Web App Backend

Phase 1.1 baseline: FastAPI app init, `/health`, and structured JSON logging.

## Run (dev)

```bash
uvicorn tunde_webapp_backend.app.main:app --reload
```

Environment (optional):

- `TUNDE_LOG_LEVEL` (default: `INFO`)
- `TUNDE_SERVICE_NAME` (default: `tunde_webapp_backend`)

