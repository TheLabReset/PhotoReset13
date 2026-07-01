"""Subida pública (invitados anónimos, sin secreto)."""
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from .. import models
from ..storage import InvalidImage, save_png

router = APIRouter(prefix="/api", tags=["public"])

MAX_BYTES = 12 * 1024 * 1024  # tope defensivo (~12MB) para el PNG 1200x1800


@router.post("/jobs", status_code=201)
async def create_job(image: UploadFile = File(...), name: str = Form("")):
    raw = await image.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Imagen vacía")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande")

    name = (name or "").strip()[:18]
    job = models.create_job(name)
    try:
        save_png(job["id"], raw)
    except InvalidImage as exc:
        # Deshacer el registro si el PNG no valida.
        models.set_status(job["id"], "failed")
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"id": job["id"], "position": models.position_of(job["id"])}
