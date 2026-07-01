"""Subida pública (invitados anónimos, sin secreto)."""
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from .. import models
from ..logging_setup import get_logger
from ..storage import InvalidImage, validate_and_clean, write_image

router = APIRouter(prefix="/api", tags=["public"])
log = get_logger("public")

MAX_BYTES = 12 * 1024 * 1024  # tope defensivo (~12MB) para el PNG 1200x1800


def _clean_name(name: str) -> str:
    # Solo caracteres imprimibles; sin bytes de control/null. Máx 18.
    return "".join(c for c in (name or "").strip() if c.isprintable())[:18]


@router.post("/jobs", status_code=201)
async def create_job(
    image: UploadFile = File(...),
    name: str = Form(""),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    if models.uploads_paused():
        # El staff pausó las subidas desde el panel.
        raise HTTPException(status_code=503, detail="Subidas en pausa. Intenta en un momento.")

    raw = await image.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Imagen vacía")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande")

    # Validar el PNG ANTES de crear el trabajo (no dejar registro colgado).
    try:
        clean = validate_and_clean(raw)
    except InvalidImage as exc:
        log.warning("upload rechazado: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    name = _clean_name(name)
    key = (idempotency_key or "").strip()[:64] or None
    job, created = models.create_job(name, idempotency_key=key)
    if created:
        write_image(job["id"], clean)
    return {"id": job["id"], "position": models.position_of(job["id"]), "duplicate": not created}
