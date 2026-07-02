# 13 años Reset — web de fotos

Web de una sola noche para la fiesta del **13 aniversario de Reset**. Es un **tema de fiesta**, NO el sistema corporativo de Reset.

## Estética (comprometida, no promedio)
Fondo **tinta** casi negro (`#120E0E`), **rojo sangre** dominante (`#D21F1F`, manda), **hueso** para texto (`#F2E9D4`), acentos **veneno** (`#4BD44A`) y **brasa** (`#F0552A`) con cuentagotas. Detalle en `docs/DESIGN.md`.

## Fuentes
**Anton** (impacto), **Space Grotesk** (cuerpo, única de lectura), **Creepster / Rubik Wet Paint / Permanent Marker / Press Start 2P** (acentos dosificados). **Nunca** Inter/Roboto/Arial.

## Anti-slop (prohibido)
Gradientes violeta→azul, glassmorphism/glows, texto en gradiente, borde de color en un solo lado de card redondeada, cards anidadas, emojis como iconos.

## Regla dura
La imagen final se **compone en el cliente, en canvas, a 1200×1776** (proporción del papel postal 100×148mm de la SELPHY; `frontend/src/lib/compose.ts`). **Nunca** en el servidor. El backend guarda el PNG tal cual llega. Es un **marco de color con la foto en ventana**; el texto ("13 AÑOS"/nombre) va con **~5mm de margen al filo** (bordes 128/150) para no cortarse en la impresión sin bordes. El recorte usa la proporción de la ventana (`CROP_ASPECT`, no distorsiona).

## Logos por fondo
`reset-r-hueso` (claro) sobre fondo oscuro; `reset-r-tinta` (oscuro) sobre fondo claro. En el marco (negro o rojo) siempre va **hueso**.

## Estructura
Frontend en Netlify (`frontend/`). Backend en Railway (`backend/`). El agente de impresión es un repo aparte que consume `docs/API-CONTRACT.md`.

## Secretos
La clave de impresora (`PRINTER_KEY`) y la del panel (`PANEL_PASSWORD`) **nunca** se commitean: van como variables de entorno en cada plataforma.

## Guardarraíles del blindaje (no romper)
El sistema está endurecido para un evento en vivo sin nadie corrigiendo. Al editar, respetar:
- **Miniaturas del panel** van por `fetch` + `Authorization: Bearer`. **Nunca** poner la clave en la URL (`?token=`).
- **Fuentes autohospedadas** en `frontend/public/fonts` (woff2). No volver al CDN de Google.
- Backend **fail-fast**: no arranca sin `PRINTER_KEY`/`PANEL_PASSWORD`/`FRONTEND_ORIGIN` (ni con `*` en CORS). No poner defaults inseguros.
- Cola: **idempotencia** por subida (`Idempotency-Key`), claim atómico, y recuperación de `printing` trabado (`PRINTING_TIMEOUT_S`). La foto se descuenta **solo** con subida confirmada. No romper estas invariantes.
- Composición: esperar fuentes con timeout (nunca colgar), stickers random horneados **una sola vez**, orientación EXIF/HEIC. Ver `frontend/src/lib/{compose,fonts,stickers}.ts`.

## Gap de contenido (lo provee el humano)
Solo hay **2 marcos** (negro/rojo) + **3 stickers** dibujados por código (bola 8, sello "13", corazón pixel). La variedad ampliada del sticker sheet (golondrinas, llamas, labios…) **no está**: no inventarla, hay TODO en `frontend/src/lib/stickers.ts`.

## Referencias
`docs/HARDENING-REPORT.md` (hallazgos+fixes), `docs/EVENT-CHECKLIST.md` (cierre manual del humano), `tests/` (verificación reproducible).
