# 13 años Reset — web de fotos

Web de una sola noche para la fiesta del **13 aniversario de Reset**. Es un **tema de fiesta**, NO el sistema corporativo de Reset.

## Estética (comprometida, no promedio)
Fondo **tinta** casi negro (`#120E0E`), **rojo sangre** dominante (`#D21F1F`, manda), **hueso** para texto (`#F2E9D4`), acentos **veneno** (`#4BD44A`) y **brasa** (`#F0552A`) con cuentagotas. Detalle en `docs/DESIGN.md`.

## Fuentes
**Anton** (impacto), **Space Grotesk** (cuerpo, única de lectura), **Creepster / Rubik Wet Paint / Permanent Marker / Press Start 2P** (acentos dosificados). **Nunca** Inter/Roboto/Arial.

## Anti-slop (prohibido)
Gradientes violeta→azul, glassmorphism/glows, texto en gradiente, borde de color en un solo lado de card redondeada, cards anidadas, emojis como iconos.

## Regla dura
La imagen final se **compone en el cliente, en canvas, a 1200×1800** (`frontend/src/lib/compose.ts`). **Nunca** en el servidor. El backend guarda el PNG tal cual llega.

## Logos por fondo
`reset-r-hueso` (claro) sobre fondo oscuro; `reset-r-tinta` (oscuro) sobre fondo claro. En el marco (negro o rojo) siempre va **hueso**.

## Estructura
Frontend en Netlify (`frontend/`). Backend en Railway (`backend/`). El agente de impresión es un repo aparte que consume `docs/API-CONTRACT.md`.

## Secretos
La clave de impresora (`PRINTER_KEY`) y la del panel (`PANEL_PASSWORD`) **nunca** se commitean: van como variables de entorno en cada plataforma.
