"""Endpoints del agente de impresión (Authorization: Bearer PRINTER_KEY).

El agente de impresión es un repo aparte que consume este contrato; no se
construye aquí. Ver docs/API-CONTRACT.md.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from .. import models
from ..auth import require_printer_key
from ..storage import read_png

router = APIRouter(prefix="/api/agent", tags=["agent"], dependencies=[Depends(require_printer_key)])


class StatusUpdate(BaseModel):
    status: str  # "printed" | "failed"


class Heartbeat(BaseModel):
    # El agente gobierna su pausa de impresión localmente y la reporta aquí; el
    # backend solo la guarda para que el panel la refleje. Ambos campos opcionales
    # para ser backward-compatible con agentes que aún mandan el heartbeat vacío.
    printing_paused: Optional[bool] = None
    prints_since_cartridge: Optional[int] = None


@router.post("/heartbeat")
def heartbeat(body: Optional[Heartbeat] = None):
    """El agente late para que el panel sepa que la impresora sigue conectada y,
    de paso, sincroniza su estado de pausa de impresión y el contador de cartucho."""
    if body is None:
        models.touch_agent()
    else:
        models.record_heartbeat(body.printing_paused, body.prints_since_cartridge)
    return {"ok": True}


@router.get("/next")
def next_job(response: Response):
    """Toma atómicamente el trabajo en cola más antiguo y lo pasa a 'printing'.

    Pedir trabajo también cuenta como señal de vida del agente. Si el agente
    reportó su impresión en pausa, responde 204 (no entrega nada) sin tocar la
    cola: así, si aún sondea estando pausado, no se le queda un trabajo trabado.
    """
    models.touch_agent()
    if models.printing_paused():
        response.status_code = 204
        return response
    job = models.claim_next()
    if job is None:
        response.status_code = 204
        return response
    return {
        "id": job["id"],
        "name": job["name"],
        "image_url": f"/api/agent/jobs/{job['id']}/image",
    }


@router.get("/jobs/{job_id}/image")
def job_image(job_id: str):
    data = read_png(job_id)
    if data is None:
        raise HTTPException(status_code=404, detail="No existe la imagen")
    return Response(content=data, media_type="image/png")


@router.post("/jobs/{job_id}/status")
def update_status(job_id: str, body: StatusUpdate):
    if body.status not in ("printed", "failed"):
        raise HTTPException(status_code=400, detail="status debe ser 'printed' o 'failed'")
    job = models.set_status(job_id, body.status)
    if job is None:
        raise HTTPException(status_code=404, detail="No existe el trabajo")
    return {"id": job["id"], "status": job["status"]}
