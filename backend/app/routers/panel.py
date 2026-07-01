"""Panel de operador (Authorization: Bearer PANEL_PASSWORD)."""
import hmac

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from .. import models
from ..auth import require_panel_password
from ..config import PANEL_PASSWORD, PAPER_TOTAL
from ..storage import read_png

router = APIRouter(prefix="/api/panel", tags=["panel"])


class LoginBody(BaseModel):
    password: str


@router.post("/login")
def login(body: LoginBody):
    """Valida la clave del panel antes de mostrar la cola en el front."""
    ok = bool(PANEL_PASSWORD) and hmac.compare_digest(body.password, PANEL_PASSWORD)
    if not ok:
        raise HTTPException(status_code=403, detail="Clave incorrecta")
    return {"ok": True}


@router.get("/queue", dependencies=[Depends(require_panel_password)])
def queue():
    jobs = models.list_jobs()
    c = models.counts()
    paper_left = max(0, PAPER_TOTAL - c["printed"])
    # El navegador carga miniaturas con <img src>, que no manda headers; por eso
    # la imagen del panel se autentica con un token en query (la clave del panel).
    return {
        "jobs": [
            {
                "id": j["id"],
                "name": j["name"],
                "status": j["status"],
                "thumb_url": f"/api/panel/jobs/{j['id']}/image?token={PANEL_PASSWORD}",
                "created_at": j["created_at"],
            }
            for j in jobs
        ],
        "counts": c,
        "paper": {"total": PAPER_TOTAL, "left": paper_left},
    }


@router.get("/jobs/{job_id}/image")
def job_image(job_id: str, token: str = ""):
    # Auth por query token (ver /queue). Comparación en tiempo constante.
    if not PANEL_PASSWORD or not hmac.compare_digest(token, PANEL_PASSWORD):
        raise HTTPException(status_code=403, detail="No autorizado")
    data = read_png(job_id)
    if data is None:
        raise HTTPException(status_code=404, detail="No existe la imagen")
    return Response(content=data, media_type="image/png")


@router.post("/jobs/{job_id}/skip", dependencies=[Depends(require_panel_password)])
def skip(job_id: str):
    job = models.set_status(job_id, "skipped")
    if job is None:
        raise HTTPException(status_code=404, detail="No existe el trabajo")
    return {"id": job["id"], "status": job["status"]}


@router.post("/jobs/{job_id}/reprint", dependencies=[Depends(require_panel_password)])
def reprint(job_id: str):
    job = models.reprint(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No existe el trabajo")
    return {"id": job["id"], "status": job["status"]}
