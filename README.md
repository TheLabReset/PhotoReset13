# 13 años Reset — web de fotos

Web mobile-first de **una sola noche** para la fiesta del 13 aniversario de Reset. Los invitados entran por un link de WhatsApp desde el celular, suben o toman una foto, la encuadran, le ponen su nombre/apodo y la mandan a imprimir a una **Canon SELPHY** conectada a una laptop en el evento. La foto sale sola, sin operador. Cada invitado tiene **2 fotos**.

> Es un **tema de fiesta**, no el sistema corporativo de Reset. Estética maximalista: tinta casi negra, rojo sangre, humor negro peruano. Ver `docs/DESIGN.md`.

## Arquitectura

```
  Invitado (celular)                Staff (laptop)
        │                                 │
        ▼                                 ▼
  ┌───────────────┐   PNG 1200x1800  ┌───────────────┐
  │  Frontend     │ ───────────────► │   Backend     │
  │  (Netlify)    │   /api/jobs      │  (Railway)    │
  │  React+Vite   │ ◄─── panel ────► │  FastAPI      │
  └───────────────┘                  │  SQLite+PNGs  │
                                     └───────┬───────┘
                                             │  /api/agent/*
                                             ▼
                                   ┌────────────────────┐
                                   │ Agente de impresión│  (repo aparte)
                                   │ Canon SELPHY        │
                                   └────────────────────┘
```

- **Frontend** (`frontend/`, Netlify): todo el flujo del invitado + panel de operador. **Compone el PNG final (1200×1800) en canvas, en el navegador** — lo que ve el usuario es exactamente lo que se imprime.
- **Backend** (`backend/`, Railway): backend fino. Recibe el PNG ya compuesto, lo guarda, maneja la cola y lo entrega al agente. **No compone nada.**
- **Agente de impresión**: repo **aparte** (no se construye aquí). Consume el contrato de `docs/API-CONTRACT.md`: pide el siguiente trabajo, descarga el PNG, imprime y reporta el estado.

Como frontend y backend viven en dominios distintos, el backend maneja **CORS** permitiendo solo el origen de Netlify.

## Estructura del repo

```
frontend/            # React + Vite + TS (Netlify, base = frontend)
  src/lib/compose.ts # composición en canvas -> PNG 1200x1800 (el corazón)
  src/styles/tokens.css
  public/brand/      # logos vivos (reset-r*.png)
backend/             # FastAPI (Railway, root = backend)
  app/               # main, db, models, storage, auth, routers/
docs/
  DESIGN.md          # sistema de diseño
  API-CONTRACT.md    # contrato frontend/backend/agente
  design-handoff/    # handoff original (referencia)
netlify.toml         # deploy del frontend
CLAUDE.md            # reglas cortas del proyecto
```

## Correr en local

**Backend** (Python 3.11+):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export PRINTER_KEY=dev-printer PANEL_PASSWORD=1313 \
       FRONTEND_ORIGIN=http://localhost:5173 DATA_DIR=./data
uvicorn app.main:app --reload --port 8000
# GET http://localhost:8000/health -> {"ok": true}
```

**Frontend** (Node 20):
```bash
cd frontend
npm install
cp .env.example .env.local   # ajusta VITE_API_BASE_URL=http://localhost:8000
npm run dev                  # http://localhost:5173  (panel en /panel)
```

## Deploy

### Netlify (frontend)
`netlify.toml` ya define `base = frontend`, `command = npm run build`, `publish = dist` (relativo a base → `frontend/dist`) y el redirect SPA `/* → /index.html` (para que la ruta `/panel` funcione).

En la **UI de Netlify** setea la variable de entorno (no se commitea):
- `VITE_API_BASE_URL` = URL pública del backend de Railway.

### Railway (backend)
`backend/railway.toml` define el builder, el `startCommand` de uvicorn y el healthcheck `/health`. Pasos en el **dashboard de Railway** (no son fiables por toml):

1. Crear un servicio desde el repo de GitHub.
2. **Root Directory** = `backend`.
3. **Config Path** = `/backend/railway.toml`.
4. Agregar un **Volume** montado en `/data`.
5. Variables de entorno del servicio:
   - `PRINTER_KEY` — clave del agente de impresión.
   - `PANEL_PASSWORD` — clave del panel de operador.
   - `FRONTEND_ORIGIN` — la URL de Netlify (para CORS).
   - `DATA_DIR=/data`.
   - `PORT` lo inyecta Railway solo.

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `PRINTER_KEY` | backend (Railway) | Bearer de los endpoints del agente |
| `PANEL_PASSWORD` | backend (Railway) | Bearer / clave del panel de operador |
| `FRONTEND_ORIGIN` | backend (Railway) | Origen permitido por CORS (URL de Netlify) |
| `DATA_DIR` | backend (Railway) | Volumen para PNGs + SQLite (`/data`) |
| `VITE_API_BASE_URL` | frontend (Netlify) | URL pública del backend |

Opcionales del backend (con defaults): `PAPER_TOTAL` (120), `PRINTING_TIMEOUT_S` (180, recuperación de cola trabada), `AGENT_STALE_S` (30, umbral de “agente sin señal”).

`.env.example` (raíz y `backend/`) tiene solo placeholders. **La clave de impresora y la del panel nunca se commitean**: van como variables de entorno en cada plataforma. El backend **se niega a arrancar** (fail-fast) si falta `PRINTER_KEY`, `PANEL_PASSWORD` o `FRONTEND_ORIGIN`.

## Robustez para el evento en vivo
El sistema está endurecido para una noche sin nadie corrigiendo: idempotencia por subida (doble tap no duplica), reintentos con backoff, SQLite en WAL, recuperación automática de cola trabada, interruptores de pausa (subidas/impresión) y heartbeat del agente en el panel, fuentes autohospedadas y logging para diagnosticar en vivo. Detalle en **`docs/HARDENING-REPORT.md`**. Antes del evento, cerrar **`docs/EVENT-CHECKLIST.md`** (impresora, sign-off visual, envs, HEIC en iPhone). Verificación reproducible en **`tests/`**.

## Agente de impresión
Es un **repo separado**. Se construye contra `docs/API-CONTRACT.md`: late con `POST /api/agent/heartbeat`, hace polling a `GET /api/agent/next` con `Authorization: Bearer PRINTER_KEY` (recibe `204` si no hay cola o si la impresión está en pausa), descarga el PNG de `image_url`, lo imprime en la Canon SELPHY y reporta con `POST /api/agent/jobs/{id}/status`.
