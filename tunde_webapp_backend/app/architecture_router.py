"""
Architecture Router
Registers under /tools/architecture/ in main.py.

Endpoints:
    POST /tools/architecture/generate     → generate & persist project
    GET  /db/architecture-projects        → list (in db_router.py)
    GET  /db/architecture-projects/{id}  → single (in db_router.py)
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .db import get_db
from .models.architecture_project import ArchitectureProject
from .task_models import ArchitectureProjectRequest, ArchitectureProjectResponse
from .tools.architecture_agent import generate_architecture_project

router = APIRouter(prefix="/tools/architecture", tags=["Architecture Visualizer"])


@router.post("/generate", response_model=ArchitectureProjectResponse)
async def create_architecture_project(
    request: ArchitectureProjectRequest,
    db: Session = Depends(get_db),
):
    """
    Generate a 3D architecture project and persist it to the DB.
    Returns ArchitectureProjectResponse with Three.js code + analysis.
    """
    try:
        ai_data = await generate_architecture_project(request.model_dump())
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Architecture Visualizer error: {exc}"
        ) from exc

    project_id = str(uuid.uuid4())
    now        = datetime.now(timezone.utc)

    response = ArchitectureProjectResponse(
        project_id=project_id,
        project_name=request.project_name,
        building_type=request.building_type,
        style=request.style,
        structure_type=request.structure_type,
        facade_material=request.facade_material,
        roof_type=request.roof_type,
        total_area=request.total_area,
        floors=request.floors,
        location_climate=request.location_climate,
        threejs_code=ai_data.get("threejs_code", ""),
        sustainability=ai_data.get("sustainability", {}),
        materials_report=ai_data.get("materials_report", {}),
        disaster_assessment=ai_data.get("disaster_assessment", {}),
        provider=ai_data.get("provider", "gemini"),
        glb_url=ai_data.get("glb_url", ""),
        created_at=now.isoformat(),
    )

    try:
        record = ArchitectureProject(
            project_id=project_id,
            user_id=request.user_id or "dev_user",
            session_id=str(request.session_id) if request.session_id else None,
            project_name=request.project_name,
            building_type=request.building_type,
            description=request.description,
            location_climate=request.location_climate,
            total_area=request.total_area,
            floors=request.floors,
            floor_height=request.floor_height,
            rooms_json=json.dumps(request.rooms),
            special_requirements=request.special_requirements,
            style=request.style,
            structure_type=request.structure_type,
            facade_material=request.facade_material,
            roof_type=request.roof_type,
            threejs_code=ai_data.get("threejs_code", ""),
            sustainability_json=json.dumps(ai_data.get("sustainability", {})),
            materials_json=json.dumps(ai_data.get("materials_report", {})),
            disaster_json=json.dumps(ai_data.get("disaster_assessment", {})),
            provider=response.provider,
            created_at=now,
            updated_at=now,
        )
        db.add(record)
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[architecture_router] DB write failed (non-fatal): {exc}")

    return response