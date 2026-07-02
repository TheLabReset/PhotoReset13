# Contrato de API — 13 años Reset

Contrato entre **frontend** (Netlify), **backend** (Railway) y el **agente de impresión** (repo aparte, no se construye aquí; consume este documento).

Base URL del backend: la que expone Railway (en el frontend es `VITE_API_BASE_URL`).

Regla de arquitectura: el frontend **compone** el PNG final (**1200×1776**) en canvas y sube ese PNG ya listo. El backend **no compone nada**: valida dimensiones, guarda el PNG tal cual, maneja la cola y lo entrega al agente.

> **Tamaño del PNG: 1200×1776 px** = postal 100×148mm a 12 px/mm (~305 dpi), la proporción exacta del papel de la Canon SELPHY. **Nota para el repo del agente:** debe conocer este tamaño; **no** necesita cambio de código porque su modo *contain* imprime cualquier proporción 1 a 1 — al coincidir con el papel, la coloca sin recortar ni dejar blanco. (Antes era 1200×1800 / 2:3, que no coincidía y recortaba los textos del borde.)

Autenticación por header `Authorization: Bearer <token>`:
- Endpoints del **agente** validan `PRINTER_KEY`.
- Endpoints del **panel** validan `PANEL_PASSWORD`.
- La **subida pública** no lleva secreto (la usan invitados anónimos).

Modelo `Job`: `id` (uuid hex), `name` (≤18), `status` (`queued|printing|printed|skipped|failed`), `created_at`, `updated_at` (ISO-8601 UTC).

---

## Público (sin secreto)

### `POST /api/jobs`
Sube el PNG final ya compuesto.
- **Body** (`multipart/form-data`): `image` (PNG **1200×1776**), `name` (string, opcional).
- **Header** (opcional pero recomendado): `Idempotency-Key: <uuid>`. Si llega dos veces la misma clave (doble tap, reintento de red), NO se crea un segundo trabajo: se devuelve el existente. El PNG se valida **antes** de crear el registro (no quedan trabajos colgados).
- Valida tipo (PNG) y dimensiones exactas. Reencodea por seguridad (descarta metadatos, guarda contra decompression bombs).
- **201** → `{ "id": "<uuid>", "position": <int>, "duplicate": <bool> }` (`duplicate: true` si se dedupeó por idempotencia).
- **400** dimensiones/tipo inválido · **413** archivo muy grande · **503** subidas en pausa desde el panel.

```bash
curl -X POST "$API/api/jobs" -H "Idempotency-Key: $(uuidgen)" \
  -F "image=@print.png;type=image/png" -F "name=MAJO CH."
```

---

## Agente (`Authorization: Bearer PRINTER_KEY`)

### `GET /api/agent/next`
Toma **atómicamente** el trabajo `queued` más antiguo, lo pasa a `printing` y lo devuelve. La atomicidad (transacción `BEGIN IMMEDIATE`) evita imprimir dos veces. Antes de reclamar, recupera trabajos trabados (ver más abajo). Pedir trabajo **también cuenta como señal de vida** del agente.
- **200** → `{ "id", "name", "image_url": "/api/agent/jobs/<id>/image" }`
- **204** si no hay nada en cola **o si la impresión está en pausa** desde el panel.

### `POST /api/agent/heartbeat`
Latido para que el panel sepa que la impresora/agente sigue vivo. Llamar cada ~10s.
- **200** → `{ "ok": true }`.

**Recuperación de cola trabada:** si un trabajo queda en `printing` y el agente muere/reinicia, tras `PRINTING_TIMEOUT_S` (default 180s) vuelve solo a `queued` en el siguiente `/next`. Al arrancar el backend también recupera. El panel puede reencolar manualmente (reprint).

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
  "counts":   { "total", "printed", "queued", "printing" },
  "paper":    { "total", "left" },
  "controls": { "uploads_paused", "printing_paused" },
  "agent":    { "last_seen", "seconds_ago", "alive" }
}
```
Orden: `printing` primero, luego `queued` (más antiguo primero), luego el resto.
`thumb_url` es `/api/panel/jobs/<id>/image` (auth Bearer). El panel la carga con `fetch` + `Authorization` y arma un object URL — la clave **no** viaja en la URL (no queda en logs/historial).

### `GET /api/panel/jobs/{id}/image`  (Bearer)
Miniatura/imagen del trabajo. **200** `image/png` · **404** no existe.

### `POST /api/panel/pause`
Interruptores de emergencia. Pausar impresión → el agente recibe `204` en `/next`. Pausar subidas → `POST /api/jobs` responde `503`.
- **Body**: `{ "target": "uploads" | "printing", "paused": <bool> }`.
- **200** → `{ "uploads_paused", "printing_paused" }`.

### `POST /api/panel/reset`
Limpia la cola: borra **todos** los trabajos y sus PNG (deja impresas/fallidas/en cola en cero). Para arrancar limpio antes del evento. **200** → `{ "deleted": <int> }`.

### `POST /api/panel/jobs/{id}/skip`
Marca `skipped`. **200** → `{ "id", "status" }`.

### `POST /api/panel/jobs/{id}/reprint`
Vuelve a `queued` (al final de la cola). Sirve para reimprimir un `printed` **o desatascar un `printing` trabado**. **200** → `{ "id", "status" }`.

---

## Salud

### `GET /health`
- **200** → `{ "ok": true }` (healthcheck de Railway).

---

## CORS
El backend solo permite el origen del frontend (`FRONTEND_ORIGIN`, la URL de Netlify), leído del entorno. Métodos `GET, POST, OPTIONS`; headers `Authorization, Content-Type, Idempotency-Key`. El backend **se niega a arrancar** (fail-fast) si faltan `PRINTER_KEY`, `PANEL_PASSWORD` o `FRONTEND_ORIGIN`.
