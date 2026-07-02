# Reporte de blindaje para el evento

Revisión de producción antes de un evento en vivo de ~45 personas, sin nadie
corrigiendo en el momento. Se desplegaron 6 revisores en paralelo (resiliencia,
seguridad, mobile, fidelidad visual, correctitud de impresión, calidad/perf).
Abajo, los hallazgos por severidad y qué se hizo con cada uno.

Leyenda: ✅ corregido · 📌 aceptado/documentado · 🧩 gap de contenido (lo provee el humano).

## ALTA

| # | Hallazgo | Estado |
|---|----------|--------|
| A1 | **Cola trabada**: un job en `printing` con el agente caído congela la cola para siempre. | ✅ Recuperación automática: `printing` > `PRINTING_TIMEOUT_S` (180s) vuelve a `queued` en cada `/next` y al arrancar; el panel puede reencolar a mano (botón *reencolar*). |
| A2 | **Sin idempotencia**: doble tap / reintento de red crea 2 trabajos y gasta 2 fotos. | ✅ El cliente manda `Idempotency-Key` por foto (se reusa en reintentos); el backend deduplica (columna `UNIQUE`), probado bajo concurrencia. |
| A3 | **Subida sin timeout**: en wifi caído el XHR cuelga para siempre. | ✅ `xhr.timeout=30s` + reintentos con backoff (1s, 2s) ante red/timeout. |
| A4 | **Foto consumida sin confirmar**: `consumePhoto()` podía descontar en un estado ambiguo. | ✅ Se descuenta **solo** tras subida confirmada; con A2 los reintentos no doble-cuentan. |
| A5 | **Registro colgado** si el PNG falla al guardarse tras crear el job. | ✅ Se valida el PNG **antes** de crear el registro. |
| A6 | **Fuentes desde CDN de Google**: dependencia externa la noche del evento. | ✅ Fuentes autohospedadas (woff2 subset latin en `/fonts`), sin llamadas a Google. |
| A7 | **`ensureFontsReady` sin timeout**: podía colgar la composición esperando una fuente. | ✅ `Promise.race` con timeout de 4s; si vence, compone con fallback y registra aviso. |
| A8 | **HEIC de iPhone** fallaba en silencio. | ✅ Se intenta decodificar igual; si el navegador no puede, mensaje claro (“usa Más compatible o sube otra”) en vez de pantalla en blanco. |
| A9 | **Config insegura por defecto**: arrancaba con secretos vacíos. | ✅ Fail-fast: no arranca sin `PRINTER_KEY`, `PANEL_PASSWORD`, `FRONTEND_ORIGIN` (ni con `*` en CORS). |
| A10 | **Clave del panel en la URL** de la miniatura (`?token=`): fuga por logs/historial. | ✅ Miniaturas por `fetch` con `Authorization: Bearer` → object URL; la clave no viaja en la URL. |
| A11 | **Login del panel** sin try/catch: rechazo no capturado si el server no responde. | ✅ Manejo de error con feedback al operador. |
| A12 | **Compose fallido** dejaba la confirmación en blanco con el botón deshabilitado. | ✅ Estado de error explícito con mensaje y “volver a encuadrar”. |

## MEDIA

| # | Hallazgo | Estado |
|---|----------|--------|
| M1 | SQLite sin WAL / timeout corto bajo concurrencia. | ✅ `PRAGMA journal_mode=WAL` + `busy_timeout=30s`; probado con 30 subidas y 40 claims en paralelo sin locks ni pérdidas. |
| M2 | Interruptores de emergencia inexistentes. | ✅ Pausar **subidas** (→ `503`) y **impresión** (→ agente recibe `204`) desde el panel. |
| M3 | Sin visibilidad del agente/impresora. | ✅ Heartbeat autenticado + indicador “conectada / sin señal (hace Ns)” en el panel. |
| M4 | Logging inexistente para diagnosticar en vivo. | ✅ Logging en backend (subidas, claims, cambios de estado, recuperación, errores) y `console.error/warn` en el front. |
| M5 | Acciones del panel (skip/reprint) sin `.catch`. | ✅ Feedback de error e indicador de conexión perdida. |
| M6 | Sin retry ante fallo puntual de red. | ✅ Cubierto por A3 (backoff). |
| M7 | `navigator.onLine` distinguía mal offline vs error. | ✅ El tipo de error del XHR decide el mensaje (sin señal / se cayó / en pausa / rechazada). |
| M8 | `100dvh` faltaba en `#root` (iOS Safari, barra de direcciones). | ✅ `#root` y `.phone` usan `100dvh`; el espaciador superior respeta el notch. |
| M9 | Decompression bomb en el upload. | ✅ `Image.MAX_IMAGE_PIXELS` acotado a 1200×1776×2. |
| M10 | CORS `*` + credentials frágil. | ✅ Fail-fast rechaza `*` con credentials. |
| M11 | `counts.queued` incluía `printing` (confuso en el panel). | ✅ `counts` separa `queued` y `printing`. |

## BAJA

| # | Hallazgo | Estado |
|---|----------|--------|
| B1 | Fuga de object URL de la foto al desmontar. | ✅ Se revoca en cleanup y al cambiar de foto. |
| B2 | Fallo del logo se cacheaba (todas las impresiones sin logo). | ✅ Solo se cachea el éxito; reintenta en la próxima foto. |
| B3 | Nombre sin sanitizar (bytes de control). | ✅ Se filtran no imprimibles; máx 18. |
| B4 | Parseo del header Bearer poco robusto. | ✅ Regex tolerante a espacios/case. |
| B5 | `catch {}` vacíos sin log en el front. | ✅ Ahora registran `console.error/warn`. |
| B6 | 404 de `/favicon.ico` (ruido en consola). | ✅ Favicon apuntado a un asset de marca. |
| B7 | Animaciones `screenIn/rise` con fade (el prototipo no lo tenía). | ✅ Alineadas al prototipo (solo translate). |
| B8 | Bundle: `react-easy-crop` (~parte del JS). | 📌 Aceptado: es la librería pedida para el recorte cover; el bundle total va ~62KB gzip. |
| B9 | Contador entre pestañas del mismo device. | 📌 Aceptado: límite blando de fiesta (el propio spec lo asume). |

## Gaps de contenido (los provee el humano) 🧩

- **Sticker sheet real**: la composición hornea 2 colores de marco (negro/rojo) y
  3 stickers dibujados por código (bola 8, sello “13” Creepster, corazón pixel).
  La variedad ampliada mencionada (golondrinas, llamas, labios, etc.) **no está**:
  no se inventó. Si se quiere, hay que proveer esos assets en **alta resolución o
  SVG** y ampliar `frontend/src/lib/stickers.ts`. Marcado como TODO en el código.

## No se tocó (fuera de alcance / por diseño)

- No se reintrodujo composición en el servidor (sigue 100% en el cliente).
- No se agregaron dependencias pesadas.
- La prueba física de la impresora es de hardware: la cierra el humano (ver
  `docs/EVENT-CHECKLIST.md`).
