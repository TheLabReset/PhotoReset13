# 13 AÑOS RESET — Web de fotos

Sistema de diseño y especificación de la web de una sola sesión para la fiesta del 13º aniversario de Reset. Documento de handoff para desarrollo (Claude Code). **Este es un tema de fiesta aparte — no el sistema corporativo de Reset.**

---

## 1. Concepto

Web mobile-first a la que los invitados entran por un link de WhatsApp: suben una foto, la encuadran, le ponen su nombre/apodo y la mandan a imprimir a una impresora que está en el evento (sin operador). Cada persona tiene **2 fotos**. Belleza maximalista, pero brutalmente fácil: se usa una vez, con una mano, en 20 segundos.

**Estética:** maximalist chaos — tattoo flash tradicional + sticker bomb + pixel art 8-bit + horror clase B + kitsch religioso latino. Rojo sangre, tinta, humor negro peruano. Textura, imperfección intencional, tensión asimétrica. Anti-pulido.

---

## 2. Tokens

Todos los valores viven en `tokens.css`. Resumen:

**Color**
- `--tinta #120E0E` — fondo base, casi negro cálido (el lienzo)
- `--sangre #D21F1F` — rojo dominante (CTAs, títulos, acentos). **Manda.**
- `--hueso #F2E9D4` — crema papel (texto/íconos sobre tinta)
- `--veneno #4BD44A` — verde tóxico, éxito/chispas (escaso)
- `--brasa #F0552A` — naranja horror, alertas suaves (escaso)

**Tipografía (Google Fonts)** — el cuerpo SIEMPRE es Space Grotesk; lo demás es sabor dosificado, máx. 2 displays por pantalla.
- **Anton** — impacto: titulares, CTAs, números, texto del marco
- **Space Grotesk** — cuerpo y toda la UI
- **Creepster** — horror: sellos, 1-2 palabras
- **Rubik Wet Paint** — solo el "13" del hero
- **Permanent Marker** — floreos al margen
- **Press Start 2P** — micro dosis: contadores, badges

**Formas / textura:** bordes tattoo `3px solid #000`, sombras duras (`0 5px 0 #000`), esquinas mixtas (recto + sticker rotado). Grano (feTurbulence overlay, opacity ~0.11) + semitono (radial-gradient dots) en todo, sin sacrificar legibilidad.

**Stickers:** bola 8, sello "13" (Creepster), corazón pixel. Van en bordes/esquinas, **nunca sobre texto o controles**.

---

## 3. Pantallas (flujo público)

1. **Portada** — hero "13" chorreante, gancho, CTA único "QUIERO IMPRIMIR", contador "Tienes N fotos".
2. **Elegir foto** — dos zonas grandes: Tomar foto (cámara) / Subir de galería.
3. **Recorte** — el corazón. Ver §4.
4. **Nombre/apodo** — un input, máx 18 chars, opcional pero sugerido. Se imprime en MAYÚSCULAS.
5. **Confirmación** — preview del marco final compuesto + aviso "usa 1 de tus 2 fotos" + aviso de baja resolución si aplica.
6. **Enviando** — barra de progreso con sello, sin spinner genérico.
7. **Éxito** — sello "EN LA COLA", muestra la impresión real, contador que baja.
8. **Límite** — "VE POR UN TRAGO" al llegar a 0/2.
9. **Panel de operador** — ver §6.

Estados de sistema diseñados: subiendo, error de subida (reintentar), sin conexión, baja calidad (aviso no bloqueante).

**Voz:** español de Perú, informal, irreverente, específico. Nada de copy genérico de relleno.

---

## 4. Recorte (contrato clave)

- Relación de aspecto fija = **proporción de la ventana de la foto** (`CROP_ASPECT` = 1020/1498 ≈ **0.681**, expuesta desde `compose.ts`). El **lienzo** completo es 100:148 (papel SELPHY); la ventana es un poco más cuadrada por los bordes del marco. Recortar a la proporción de la ventana evita distorsión al dibujar.
- Modo **cover**: la ventana siempre llena, nunca hay bordes vacíos. El zoom mínimo es el que cubre la ventana; no se puede alejar más.
- Gestos: arrastrar (pan) + pinch/slider/rueda (zoom).
- Salida: **coordenadas del recorte** en px de la imagen original — `{ x, y, width, height }` (equivalente a `croppedAreaPixels` de react-easy-crop). No se recorta la imagen en el cliente; las coordenadas viajan con la foto.
- En el prototipo el cropper está hecho a medida con este mismo contrato de salida; se puede reemplazar por **react-easy-crop** sin tocar el resto.

---

## 5. Composición de la impresión (la app compone)

**Decisión de arquitectura: el cliente compone la imagen final, no el servidor.** El preview *es* la impresión. No hay marco PNG separado ni doble marco.

Al enviar, se genera en canvas un **PNG 1200×1776 (100:148, postal 100×148mm @~305dpi)** apilando:
1. **Marco** de color (**negro o rojo**, random por foto) a todo el lienzo (sangra a los 4 bordes).
2. Foto del invitado recortada dentro de la **ventana** (bordes: lados 90, arriba 128, abajo 150), a resolución completa desde el bitmap original (sin pérdida). El recorte usa la **proporción de la ventana** (≈0.681), así no se distorsiona.
3. "13 AÑOS" arriba (Anton) y logo R + nombre abajo — con **~5mm de margen al filo** (2.5× el overscan típico de ~2mm).
4. Stickers **random por foto** (bola 8 / sello 13 / corazón pixel + sticker sheet PNG) montando el borde de la ventana, con contorno hueso die-cut.

El lienzo coincide con la proporción del papel de la SELPHY: el agente (modo contain) imprime 1 a 1 sin recortar. El color del marco llega al filo; el sobre-escaneo sin bordes (~2mm) solo come color de marco, nunca el texto. Ese PNG es lo que se manda a la impresora.

---

## 6. Panel de operador

Ruta aparte, entrada con clave (demo: `1313`). Lista de la cola en vivo con miniatura (recortada), estado (imprimiendo / en cola / listo), acciones **saltar** y **reimprimir**, e indicador de papel. Solo lee y comanda; no toca la impresora directamente.

---

## 7. Persistencia y límites

- Límite blando de 2 fotos por dispositivo: `localStorage['reset13_photos']`.
- Cola: `localStorage['reset13_queue']`.
- Es un límite de fiesta; blando y por dispositivo está bien.

---

## 8. Reglas anti-slop (obligatorias)

Prohibido: Inter/Roboto/Arial como fuente de marca; gradientes violeta→azul; glassmorphism/glows de neón; texto en gradiente; el "borde de color en un lado de card redondeada"; cards anidadas; fondo crema/beige por reflejo (el fondo es tinta); copy genérico de relleno; estados muertos; padding/radio idénticos en toda la página. Si algo se siente seguro y promedio, está mal.

---

## 9. Archivos del proyecto

- `Prototipo 13 Reset.dc.html` — prototipo interactivo completo (flujo público + operador + composición del PNG).
- `Vitrina 13 Reset.dc.html` — vitrina del sistema y las pantallas.
- `tokens.css` — tokens de diseño.
- `assets/reset-r-*.png` — logo R tintado (hueso/sangre/tinta) para composición.
