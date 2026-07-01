# Handoff: Web de fotos "13 años Reset"

## Overview
Web mobile-first de una sola sesión para la fiesta del 13º aniversario de **Reset** (agencia de medios, Lima). Los invitados entran por un link de WhatsApp, suben o toman una foto, la encuadran, le ponen su nombre/apodo y la mandan a imprimir a una impresora que está en el evento (sin operador). Cada invitado tiene **2 fotos**. Incluye además un **panel de operador** con clave para vigilar la cola. Estética de fiesta irreverente y maximalista — **no** es el sistema corporativo de Reset.

## About the Design Files
Los archivos de este bundle son **referencias de diseño creadas en HTML** (Design Components que corren en el navegador): prototipos que muestran el look y el comportamiento buscados, **no** código de producción para copiar tal cual. La tarea es **recrear estos diseños en el entorno del codebase destino** (React/Vue/SwiftUI/native…) usando sus patrones y librerías establecidas. Si no hay codebase aún, elegir el framework más apropiado (recomendado: **React + Vite**, ya que el prototipo usa lógica de estilo React) e implementarlo ahí.

El prototipo (`Prototipo 13 Reset.dc.html`) es **funcional**: sube una foto real, recorta con gestos y compone el PNG final — úsalo como fuente de verdad del comportamiento.

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciado e interacciones son finales. Recrear pixel-perfect con las librerías/patrones del codebase. Los valores exactos están en `tokens.css` y abajo.

---

## Design Tokens

**Color**
- `--tinta` `#120E0E` — fondo base (casi negro cálido)
- `--tinta-2` `#1B1514` — elevación / glow
- `--sangre` `#D21F1F` — rojo dominante (CTAs, títulos, acentos). Manda.
- `--sangre-2` `#A81414` — sombra dura / active del rojo
- `--hueso` `#F2E9D4` — crema papel (texto/íconos sobre tinta)
- `--hueso-d` `#D8CDB2` — hueso apagado (texto secundario)
- `--veneno` `#4BD44A` — verde tóxico (éxito/chispas, escaso)
- `--brasa` `#F0552A` — naranja horror (alertas suaves, escaso)
- `--linea` `#3A2E2C` — bordes/divisores · `--texto-2` `#9A908A` · `--texto-3` `#6A605C`

**Tipografía (Google Fonts):** Anton, Space Grotesk (400/500/700), Creepster, Rubik Wet Paint, Permanent Marker, Press Start 2P.
- Cuerpo y UI: **siempre Space Grotesk**. Máx. 2 fuentes display por pantalla.
- Anton → impacto (titulares, CTAs, números, texto del marco)
- Creepster → horror (sellos, 1-2 palabras) · Rubik Wet Paint → solo el "13" del hero
- Permanent Marker → floreos al margen · Press Start 2P → micro (contadores, badges)

**Escala de tipo (mobile):** hero 150px · display 34px · title 22px · body 14px · small 12px · micro 9px. line-height tight 0.92 / body 1.45.

**Espaciado:** 4 / 8 / 12 / 16 / 22 / 26 / 40px. Padding lateral de pantalla 26px. Target táctil mínimo **48px**.

**Formas:** radios btn 5 / card 6 / phone 42px. Borde tattoo `3px solid #000`. Sombra botón `0 5px 0 #000, 0 5px 0 2px var(--sangre-2)` (se hunde 4px en `:active`). Sombra card `0 16px 34px -14px rgba(0,0,0,.9)`.

**Texturas (obligatorias, rompen el look de IA):**
- Grano: overlay `feTurbulence` (baseFrequency 0.9), `opacity ~0.11`, `mix-blend-mode: overlay`.
- Semitono: `radial-gradient(circle, rgba(255,255,255,.06) 1px, transparent 1.6px)` size `7px`.
- Nunca reducir la legibilidad del texto funcional.

---

## Screens / Views

Todas mobile-first, una columna, ancho de diseño ~344px (contenido a 322–344). Transición entre pantallas: `translateY(8px)` + fade, .34s ease.

### 1. Portada
- **Propósito:** entender qué es y tocar el CTA en 2s.
- **Layout:** columna centrada. Logo R (26px, hueso) + "RESET" (Anton 13px, tracking .32em). "13" en Rubik Wet Paint 150px, color sangre, sombra `0 5px 0 #000`. "TRECE AÑOS" (Anton 27px, hueso). Gancho (Space Grotesk 14px, `#b7ada6`): *"Se vienen cositas. Deja tu foto para la posteridad."* CTA "QUIERO IMPRIMIR" (botón sangre, Anton 27px). Nota: *"Tienes N FOTOS, elígelas bien."* (N en Press Start 2P veneno).
- **Stickers decorativos** en esquinas (bola 8 arriba-der, corazón pixel izq), nunca sobre el CTA.
- Footer discreto: links "staff" y "↺ reiniciar demo".
- Reveal escalonado al cargar (animation-delay .05→.72s).

### 2. Elegir foto
- Título "TU FOTO, TU LEYENDA" (Anton 34px). Subtítulo "¿De dónde la sacamos?".
- Dos zonas táctiles grandes (borde 3px, radio 6px, bg `#160f0e`): **TOMAR FOTO** (borde sangre, `<input type=file accept="image/*" capture="environment">`) y **SUBIR DE GALERÍA** (borde `#3a2e2c`, `<input type=file accept="image/*">`). Cada una con ícono dibujado en CSS y label Anton 24px.
- Link "‹ inicio" arriba.

### 3. Recorte (el corazón) — ver "Interacciones"
- Título "ENCUADRA" + "Arrastra y pellizca. Lo que ves es lo que sale."
- Ventana de recorte **252×378** (2:3), overflow hidden, `touch-action:none`. La foto se posiciona con `transform: translate(...)` y se escala.
- Overlays (pointer-events none): stroke interior `inset 0 0 0 2px rgba(242,233,212,.8)`, grilla de tercios, degradado sup/inf, "13 AÑOS" arriba y `{apodo}` abajo (ghosted, para previsualizar).
- Slider de zoom (`accent-color:#D21F1F`), lectura en vivo `recorte → x:_ y:_ · _×_px` (Press Start 2P 7px). Botones "USAR ESTA FOTO" y "Cambiar foto".

### 4. Nombre / apodo
- "¿QUIÉN ERES?" (Anton 32px). Input (`.inp`, borde `#3a2e2c`, focus sangre) placeholder **"Tu nombre o tu apodo"**, `maxlength=18`. Contador `N/18` (Press Start 2P). Floreo Permanent Marker "¡con estilo!". Nota en caja dashed: se imprime en MAYÚSCULAS. Botón "SIGUIENTE".

### 5. Confirmación
- "ASÍ SE VA A IMPRIMIR". Preview del **marco final compuesto** (ver Composición) a ~182px de ancho. Aviso baja-res (borde brasa) solo si la imagen es < 900×1200. Aviso "Esto usa 1 de tus N fotos. No hay vuelta." Botones "ENVIAR A IMPRIMIR" y "Volver a encuadrar".

### 6. Enviando
- "MANDANDO A LA COLA", barra de progreso a rayas (`repeating-linear-gradient` sangre) con `%` (Press Start 2P). Sin spinner genérico.

### 7. Éxito
- Sello "EN LA COLA" (círculo veneno, Creepster) con animación stamp. "¡LISTO!". "Así salió tu impresión. Recógela en la mesa." **Muestra la imagen impresa compuesta** (~106px). Contador "Te queda N FOTO(S)" (color veneno; 0 en brasa). Botones "MANDAR OTRA"/"VER LA COLA" + "↓ PNG" (descarga la impresión).

### 8. Límite
- "0/2" (Press Start 2P, flick). "se acabó" (Creepster 52px). **"VE POR UN TRAGO"** (Anton 32px sangre). "Ya quemaste tus 2 fotos, crack." Botón "Ver la cola".

### 9. Staff login
- Logo + "PANEL DE COLA" + "SOLO STAFF". Input password "Clave del evento" (centrado, tracking). Botón "ENTRAR". Clave demo: **1313** (parametrizar en prod). Error: "Clave incorrecta, pe." + shake.

### 10. Cola (operador)
- Header "COLA EN VIVO" + indicador "PAPEL N/40" + "quedan N hojas". Filas: miniatura recortada (38×57), nombre (Space Grotesk 700 14px), estado (primera = "IMPRIMIENDO…" en brasa Press Start 2P + borde izq brasa; resto "en cola · #n"). Acción **saltar** (mueve al final) y **reimprimir** (re-encola copia). Estado vacío con mensaje.

### Estados de sistema (diseñar todos)
Subiendo (barra), error de subida (borde sangre, "se cayó / LA SUBIDA", reintentar), sin conexión (dashed, "SIN CONEXIÓN", reintentar), baja calidad (borde brasa, no bloqueante). Fotos muy pesadas: reducir sola sin molestar.

---

## Interactions & Behavior

**Recorte (contrato clave):**
- Aspecto fijo **2:3**. Modo **cover**: la ventana siempre llena; el zoom mínimo es el que cubre; no se puede alejar más → nunca hay bordes vacíos.
- Gestos: drag (pointer events), pinch (2 dedos), slider y rueda para zoom. Al hacer zoom se re-clampa el offset para mantener cover; el zoom es alrededor del centro de la ventana.
- Math: `dispScale = max(W/nW, H/nH) * zoom`; offset clamp `[W-dw, 0]×[H-dh, 0]`.
- **Salida:** coordenadas del recorte en px de la imagen original `{ x, y, width, height }` = `x=-offX/dispScale`, `y=-offY/dispScale`, `width=W/dispScale`, `height=H/dispScale`. Equivalente a `croppedAreaPixels` de **react-easy-crop** — en prod se puede usar esa librería directamente con el mismo contrato. La imagen NO se recorta en cliente; las coordenadas viajan con la foto.

**Composición de la impresión (la app compone, no el servidor):** el preview *es* la impresión — no hay marco PNG separado ni doble marco. Al enviar se genera en canvas un **PNG 1200×1800 (2:3, 4"×6" @300dpi)** apilando:
1. Foto recortada: `drawImage(img, crop.x, crop.y, crop.width, crop.height, wx, wy, ww, wh)` con clip a la ventana.
2. Marco: relleno **negro (`#120E0E`) o rojo (`#D21F1F`) — random por foto**; keyline interior `rgba(255,255,255,.18)`; "13 AÑOS" arriba (Anton 76px, tracking, hueso); logo R + `{apodo}` en una línea abajo (Anton 60px).
3. Stickers **random por foto** (bola 8 / sello 13 Creepster / corazón pixel 7×7) en esquinas.
- Bordes del marco (sobre 1200px): lados 90, arriba 120, **abajo 150** (casi parejos; inferior apenas mayor para el nombre). Ventana = 1020×1530.
- Ese dataURL/blob es lo que se manda a la impresora.

**Animaciones:** reveal de entrada (rise, translateY+fade), stamp en éxito, flick en el "0/2" del límite, shake en clave errada. Botones se hunden 4px en `:active`.

## State Management
- `screen`: portada | source | crop | name | confirm | sending | success | limit | staff | queue
- Foto: `imgSrc`, `nW`, `nH`, `zoom` (min 1, max 4), `offX`, `offY`, `lowRes`
- `name` (≤18), `frameRed` (bool, random 40%), `stk` (0–2, random)
- `photosLeft` (default 2), `queue[]`, `clave`, `claveErr`, `progress`, `lastPrint` (dataURL)
- **Persistencia (localStorage):** `reset13_photos` (nº fotas restantes), `reset13_queue` (JSON de la cola). Límite blando por dispositivo — apropiado para fiesta.
- Transiciones: `QUIERO IMPRIMIR` → source si `photosLeft>0`, si no → limit. `ENVIAR` → sending (progreso simulado) → compone PNG → decrementa `photosLeft`, encola, → success.

## Assets
- `assets/reset-r-hueso.png`, `reset-r-sangre.png`, `reset-r-tinta.png` — logo "R" de Reset tintado (el original negro sobre transparente lo dio el cliente; estas versiones se derivaron para componer sobre fondos). Usar la versión hueso (blanca) sobre marco negro y rojo.
- Fuentes: Google Fonts (ver tokens). Para componer texto en canvas hay que asegurar que las fuentes estén cargadas (`document.fonts.ready`).
- No hay otros bitmaps: íconos y stickers están dibujados en CSS/canvas.

## Files
- `Prototipo 13 Reset.dc.html` — **prototipo funcional** (flujo público + operador + composición del PNG). Fuente de verdad del comportamiento.
- `Vitrina 13 Reset.dc.html` — vitrina del sistema y todas las pantallas/estados.
- `tokens.css` — tokens de diseño (variables CSS).
- `DESIGN.md` — especificación narrativa del sistema.
- `assets/` — logo R tintado.

> Los `.dc.html` son "Design Components" — abren directo en el navegador. Para leer la lógica, mira el `<script>` de la clase `Component` (React-like: `state` + `renderVals()`), y la plantilla arriba.
