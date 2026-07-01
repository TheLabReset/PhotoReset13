# Contrato de API — 13 años Reset

Contrato entre **frontend** (Netlify), **backend** (Railway) y el **agente de impresión** (repo aparte, no se construye aquí; consume este documento).

Base URL del backend: la que expone Railway (en el frontend es `VITE_API_BASE_URL`).

Regla de arquitectura: el frontend **compone** el PNG final (1200×1800) en canvas y sube ese PNG ya listo. El backend **no compone nada**: valida dimensiones, guarda el PNG tal cual, maneja la cola y lo entrega al agente.

Autenticación por header `Authorization: Bearer <token>`:
- Endpoints del **agente** validan `PRINTER_KEY`.
- Endpoints del **panel** validan `PANEL_PASSWORD`.
- La **subida pública** no lleva secreto (la usan invitados anónimos).

Modelo `Job`: `id` (uuid hex), `name` (≤18), `status` (`queued|printing|printed|skipped|failed`), `created_at`, `updated_at` (ISO-8601 UTC).

---

## Público (sin secreto)

### `POST /api/jobs`
Sube el PNG final ya compuesto.
- **Body** (`multipart/form-data`): `image` (PNG **1200×1800**), `name` (string, opcional).
- Valida tipo (PNG) y dimensiones exactas. Reencodea por seguridad (descarta metadatos).
- **201** → `{ "id": "<uuid>", "position": <int> }` (posición 1-indexada en la cola).
- **400** dimensiones/tipo inválido · **413** archivo muy grande.

```bash
curl -X POST "$API/api/jobs" -F "image=@print.png;type=image/png" -F "name=MAJO CH."
```

---

## Agente (`Authorization: Bearer PRINTER_KEY`)

### `GET /api/agent/next`
Toma **atómicamente** el trabajo `queued` más antiguo, lo pasa a `printing` y lo devuelve. La atomicidad (transacción `BEGIN IMMEDIATE`) evita imprimir dos veces.
- **200** → `{ "id", "name", "image_url": "/api/agent/jobs/<id>/image" }`
- **204** si no hay nada en cola.

### `GET /api/agent/jobs/{id}/image`
Devuelve los bytes del PNG.
- **200** `image/png` · **404** si no existe.

### `POST /api/agent/jobs/{id}/status`
Actualiza el estado tras imprimir.
- **Body** (`application/json`): `{ "status": "printed" | "failed" }`.
- **200** → `{ "id", "status" }` · **400** estado inválido · **404** no existe.

Ciclo típico del agente: `GET /next` → `GET /image` → imprimir → `POST /status {printed}`. Si falla la impresión, `POST /status {failed}` (el panel puede reimprimir).

---

## Panel (`Authorization: Bearer PANEL_PASSWORD`)

### `POST /api/panel/login`
Valida la clave antes de mostrar la cola en el front. **No** requiere header (recibe la clave en el body).
- **Body**: `{ "password": "<clave>" }`.
- **200** → `{ "ok": true }` · **403** clave incorrecta.

### `GET /api/panel/queue`
- **200** →
```json
{
  "jobs": [
    { "id", "name", "status", "thumb_url", "created_at" }
  ],
  "counts": { "total", "printed", "queued" },
  "paper":  { "total", "left" }
}
```
Orden: `printing` primero, luego `queued` (más antiguo primero), luego el resto.
`thumb_url` incluye un `?token=<PANEL_PASSWORD>` porque el navegador carga miniaturas con `<img src>` (sin headers).

### `GET /api/panel/jobs/{id}/image?token=<PANEL_PASSWORD>`
Miniatura/imagen del trabajo. Auth por query token. **200** `image/png` · **403** token inválido · **404** no existe.

### `POST /api/panel/jobs/{id}/skip`
Marca `skipped`. **200** → `{ "id", "status" }`.

### `POST /api/panel/jobs/{id}/reprint`
Vuelve a `queued` (al final de la cola). **200** → `{ "id", "status" }`.

---

## Salud

### `GET /health`
- **200** → `{ "ok": true }` (healthcheck de Railway).

---

## CORS
El backend solo permite el origen del frontend (`FRONTEND_ORIGIN`, la URL de Netlify), leído del entorno. Métodos `GET, POST, OPTIONS`; headers `Authorization, Content-Type`.
