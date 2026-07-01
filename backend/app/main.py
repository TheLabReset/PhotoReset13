"""FastAPI — backend fino de la web de fotos "13 años Reset".

Responsabilidades: recibir el PNG final ya compuesto, guardarlo, manejar la
cola y entregarlo al agente de impresión. NO compone imágenes: toda la
inteligencia visual vive en el frontend.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import FRONTEND_ORIGIN, validate_required
from .db import init_db
from .logging_setup import get_logger, setup_logging
from .models import recover_stuck
from .routers import agent, panel, public


@asynccontextmanager
async def lifespan(_app: FastAPI):
    setup_logging()
    log = get_logger("app")
    # Fail-fast: si faltan secretos/origen, no arrancar (mejor que arrancar inseguro).
    validate_required()
    init_db()
    # Al arrancar (p.ej. tras un reinicio), recuperar cualquier trabajo trabado.
    recover_stuck()
    log.info("backend listo (CORS origin=%s)", FRONTEND_ORIGIN)
    yield


app = FastAPI(title="13 años Reset — cola de impresión", version="1.0.0", lifespan=lifespan)

# CORS: frontend (Netlify) y backend (Railway) viven en dominios distintos.
# Solo se permite el origen del frontend, leído del entorno.
_origins = [o.strip() for o in FRONTEND_ORIGIN.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(public.router)
app.include_router(agent.router)
app.include_router(panel.router)
