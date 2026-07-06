# Checklist manual del evento — 13 años Reset

Lo que el código ya dejó verde está en `docs/HARDENING-REPORT.md`. Esto es lo que
**solo un humano puede cerrar**. Hazlo con tiempo, no la noche del evento.

## 0. Modo buzón (impresión diferida) 📥 — el que se usa ahora

La impresión en vivo no se pudo la noche del evento, así que el flujo pasó a
**recibir todas las fotos ahora e imprimirlas/entregarlas después**. La web guarda
todo; el agente/worker se conecta luego para imprimir. Nada se borra solo.

- [ ] **Recibir**: comparte el link. Cada invitado manda hasta **2 fotos** con su nombre; el marco se compone igual (1200×1776). Todo queda guardado en el servidor (volumen de Railway `/data`), en estado `queued`, esperando.
- [ ] **Cerrar el buzón** cuando ya no quieras recibir más: en el panel, **pausar subidas** (el invitado ve "en pausa"). Reanudable si hace falta.
- [ ] **Respaldo antes de imprimir**: en el panel, **⬇ descargar todas** baja un zip con todas las fotos. Guárdalo en dos sitios. **NO llames a `/api/panel/reset` hasta haber impreso y entregado** (borra todo, es irreversible).
- [ ] **Imprimir después**: conecta el agente/worker (en una laptop que sí funcione) apuntando al backend con el `PRINTER_KEY`. Empezará a drenar la cola solo, del más antiguo al más nuevo, e irá marcando `impresas`. No hay que tocar nada más.
- [ ] Verifica en el panel que el contador **impresas** sube y **en cola** baja mientras el worker trabaja.

> Nota Windows 11: si el agente detecta la impresora y luego la deja en *busy* sin recibir el trabajo (lo que pasó el día del evento), es problema del lado del agente/driver, no de la web — la cola y las fotos quedan intactas para reintentar.

## 1. Prueba de impresora (10 min, en la laptop Windows del evento) 🖨️
- [ ] Conectar la Canon SELPHY a la laptop y confirmar que imprime una foto de prueba desde Windows.
- [ ] Correr el **agente de impresión** (repo aparte) apuntando al backend con `PRINTER_KEY`.
- [ ] Subir 1 foto desde un celular por el flujo real y confirmar que **sale impresa sola**, sin operador.
- [ ] Verificar tamaño/encuadre: la impresión debe ser postal 100×148mm (1200×1776, ~305dpi), sin bordes vacíos.
- [ ] Matar el agente a mitad de un trabajo y confirmar que, tras el timeout, ese trabajo vuelve a la cola y se reimprime (recuperación de cola trabada).
- [ ] En el panel, ver que la impresora aparece como **“conectada”** cuando el agente late, y **“sin señal”** cuando lo apagas.
- [ ] **Pausa de subidas** (lo único que comanda el panel): pausar → el invitado ve “EN PAUSA”; reanudar → vuelve a subir. Confirmar los dos sentidos.
- [ ] **Pausa de impresión** (la gobierna el **agente**, no el panel): pausar el agente en su laptop y confirmar que el panel lo **refleja** (“IMPRESIÓN EN PAUSA (agente)”); reanudar y ver que vuelve a “ACTIVA”. El panel no tiene botón para pausar la impresión, es solo lectura. **Para destrabar una pausa de impresión: reanudar en el agente/impresora, NO en el panel** (el panel no puede reanudar la impresión remotamente, por diseño).
- [ ] **Contador de cartucho**: con el agente reportando `prints_since_cartridge`, ver que el panel muestra “CARTUCHO left/108” y, cerca del final, el aviso **“cambiar cartucho KP-108IN”**. Al cambiar el cartucho el agente reinicia el contador y el panel vuelve a 108.
- [ ] **Contadores** del panel separados y correctos: en cola / imprimiendo / impresas.

> Nota: la prueba física de impresión es hardware y no se puede automatizar; por eso está acá.

## 2. Sign-off visual contra el prototipo 👁️
- [ ] Abrir `docs/design-handoff/vitrina-13-reset.dc.html` (referencia) y comparar pantalla por pantalla con la app en un celular real.
- [ ] Confirmar en el celular: fuentes correctas (Anton / Space Grotesk / Creepster / Rubik Wet Paint / Press Start 2P), textura de grano, stickers en las esquinas, y el marco **sobre** la foto en la confirmación.
- [ ] Revisar los screenshots capturados por el E2E (`tests/README.md` §4) como respaldo. La fidelidad **no** se declara al 100% sin este sign-off humano.

## 3. Variables de entorno a setear (no se commitean) 🔑

### Railway (backend) — Root Directory `backend`, Config Path `/backend/railway.toml`, Volume en `/data`
- [ ] `PRINTER_KEY` = clave secreta del agente de impresión.
- [ ] `PANEL_PASSWORD` = clave del panel de operador (la que usa el staff).
- [ ] `FRONTEND_ORIGIN` = URL exacta de Netlify (ej. `https://reset13.netlify.app`). **Sin barra final, sin `*`.**
- [ ] `DATA_DIR` = `/data`.
- [ ] (opcional) `PAPER_TOTAL` (default **108**, cartucho KP-108IN), `PAPER_LOW_THRESHOLD` (default 10), `PRINTING_TIMEOUT_S`, `AGENT_STALE_S` si quieres cambiar los defaults.
- [ ] Confirmar que arranca: `/health` → `{"ok":true}`. (Si falta un secreto, **no arranca** a propósito.)
- [ ] (opcional, **destructivo**) Vaciar la cola de pruebas antes de abrir: `curl -X POST "$API/api/panel/reset" -H "Authorization: Bearer $PANEL_PASSWORD"`. Borra todos los trabajos y sus PNG; hacerlo una sola vez y con cuidado (no hay botón en el panel a propósito).

### Netlify (frontend) — Base `frontend`
- [ ] `VITE_API_BASE_URL` = URL pública del backend de Railway.
- [ ] Re-deploy después de setear la variable (Vite la hornea en build).

## 4. Prueba con iPhone real subiendo HEIC 📱
- [ ] Con un iPhone (Ajustes › Cámara › Formatos en **“Alta eficiencia”** = HEIC), tomar una foto y subirla por el flujo.
- [ ] Confirmar que se decodifica y compone bien **o** que aparece el mensaje claro pidiendo cambiar a “Más compatible” / subir otra (no una pantalla en blanco).
- [ ] Repetir en “Más compatible” (JPEG) para confirmar el camino feliz.
- [ ] Probar también un Android real (cámara + galería).

## 5. Ensayo general (recomendado)
- [ ] 3–4 personas suben fotos casi a la vez y confirmar que todas entran a la cola (sin duplicados ni pérdidas).
- [ ] Doble-tap en “ENVIAR A IMPRIMIR” y confirmar que crea **una sola** foto.
- [ ] Poner el celular en modo avión a mitad de subida y confirmar el mensaje “sin conexión” + reintento.
- [ ] Confirmar que cada device se queda sin fotos a las 2 (pantalla “VE POR UN TRAGO”).
- [ ] Anotar la URL del panel (`/panel`) y la clave para el staff.
