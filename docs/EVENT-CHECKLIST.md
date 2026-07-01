# Checklist manual del evento — 13 años Reset

Lo que el código ya dejó verde está en `docs/HARDENING-REPORT.md`. Esto es lo que
**solo un humano puede cerrar**. Hazlo con tiempo, no la noche del evento.

## 1. Prueba de impresora (10 min, en la laptop Windows del evento) 🖨️
- [ ] Conectar la Canon SELPHY a la laptop y confirmar que imprime una foto de prueba desde Windows.
- [ ] Correr el **agente de impresión** (repo aparte) apuntando al backend con `PRINTER_KEY`.
- [ ] Subir 1 foto desde un celular por el flujo real y confirmar que **sale impresa sola**, sin operador.
- [ ] Verificar tamaño/encuadre: la impresión debe ser 4"×6" (1200×1800 @300dpi), sin bordes vacíos.
- [ ] Matar el agente a mitad de un trabajo y confirmar que, tras el timeout, ese trabajo vuelve a la cola y se reimprime (recuperación de cola trabada).
- [ ] En el panel, ver que la impresora aparece como **“conectada”** cuando el agente late, y **“sin señal”** cuando lo apagas.
- [ ] Probar los interruptores del panel: **pausar impresión** (deja de salir) y **reanudar**; **pausar subidas** (el invitado ve “en pausa”) y **reanudar**.

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
- [ ] (opcional) `PAPER_TOTAL`, `PRINTING_TIMEOUT_S`, `AGENT_STALE_S` si quieres cambiar los defaults.
- [ ] Confirmar que arranca: `/health` → `{"ok":true}`. (Si falta un secreto, **no arranca** a propósito.)

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
