"""Panel de operador (Authorization: Bearer PANEL_PASSWORD)."""
import hmac

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from .. import models
from ..auth import require_panel_password
from ..config import PANEL_PASSWORD, PAPER_TOTAL
from ..logging_setup import get_logger
from ..storage import delete_photo, read_png

router = APIRouter(prefix="/api/panel", tags=["panel"])
log = get_logger("panel")


class LoginBody(BaseModel):
    password: str


class PauseBody(BaseModel):
    target: str  # "uploads" | "printing"
    paused: bool


@router.post("/login")
def login(body: LoginBody):
    """Valida la clave del panel antes de mostrar la cola en el front."""
    ok = bool(PANEL_PASSWORD) and hmac.compare_digest(body.password, PANEL_PASSWORD)
    if not ok:
        log.warning("panel login fallido")
        raise HTTPException(status_code=403, detail="Clave incorrecta")
    return {"ok": True}


@router.get("/queue", dependencies=[Depends(require_panel_password)])
def queue():
    jobs = models.list_jobs()
    c = models.counts()
    paper_left = max(0, PAPER_TOTAL - c["printed"])
    return {
        "jobs": [
            {
                "id": j["id"],
                "name": j["name"],
                "status": j["status"],
                # Miniatura autenticada con Bearer (el front la carga con fetch),
                # no un token en la URL: así la clave no queda en logs/historial.
                "thumb_url": f"/api/panel/jobs/{j['id']}/image",
                "created_at": j["created_at"],
            }
            for j in jobs
        ],
        "counts": c,
        "paper": {"total": PAPER_TOTAL, "left": paper_left},
        "controls": {
            "uploads_paused": models.uploads_paused(),
            "printing_paused": models.printing_paused(),
        },
        "agent": models.agent_status(),
    }


@router.get("/jobs/{job_id}/image", dependencies=[Depends(require_panel_password)])
def job_image(job_id: str):
    data = read_png(job_id)
    if data is None:
        raise HTTPException(status_code=404, detail="No existe la imagen")
    return Response(content=data, media_type="image/png")


@router.post("/pause", dependencies=[Depends(require_panel_password)])
def pause(body: PauseBody):
    """Interruptores de emergencia: pausar subidas y/o impresión."""
    if body.target not in ("uploads", "printing"):
        raise HTTPException(status_code=400, detail="target inválido")
    models.set_paused(body.target, body.paused)
    return {
        "uploads_paused": models.uploads_paused(),
        "printing_paused": models.printing_paused(),
    }


@router.post("/reset", dependencies=[Depends(require_panel_password)])
def reset():
    """Limpia la cola: borra todos los trabajos y sus PNG. Deja las cuentas en
    cero (impresas/fallidas/en cola). Útil para arrancar limpio antes del evento."""
    ids = [j["id"] for j in models.list_jobs()]
    for jid in ids:
        delete_photo(jid)
    deleted = models.clear_all_jobs()
    log.warning("panel: reset de la cola (%d borrados)", deleted)
    return {"deleted": deleted}


@router.post("/jobs/{job_id}/skip", dependencies=[Depends(require_panel_password)])
def skip(job_id: str):
    job = models.set_status(job_id, "skipped")
    if job is None:
        raise HTTPException(status_code=404, detail="No existe el trabajo")
    return {"id": job["id"], "status": job["status"]}


@router.post("/jobs/{job_id}/reprint", dependencies=[Depends(require_panel_password)])
def reprint(job_id: str):
    """Reencola el trabajo (reimprimir, o desatascar uno trabado en 'printing')."""
    job = models.reprint(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No existe el trabajo")
    return {"id": job["id"], "status": job["status"]}
