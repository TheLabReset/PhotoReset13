# Suite de verificación

Scripts para verificar el sistema antes del evento. No son dependencias del
proyecto: se corren a mano.

## 1. Build del frontend
```bash
cd frontend && npm ci && npm run build   # genera frontend/dist sin errores
```

## 2. Backend arranca y responde health
```bash
cd backend && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export PRINTER_KEY=pk PANEL_PASSWORD=1313 FRONTEND_ORIGIN=http://127.0.0.1:5173 DATA_DIR=./data
uvicorn app.main:app --port 8000
curl -s localhost:8000/health   # -> {"ok":true}
```
(Sin esos env vars, el backend **se niega a arrancar** — es a propósito.)

## 3. Test de concurrencia (subidas en paralelo, dedupe, claim atómico, cola trabada)
Con el backend corriendo en el puerto 8040 y `PRINTING_TIMEOUT_S=1`:
```bash
export DATA_DIR=/tmp/conc PRINTER_KEY=pk PANEL_PASSWORD=1313 \
       FRONTEND_ORIGIN=http://127.0.0.1:5173 PRINTING_TIMEOUT_S=1
uvicorn app.main:app --port 8040 &         # desde backend/ con el venv activo
python -c "from PIL import Image; Image.new('RGB',(1200,1800),(210,31,31)).save('/tmp/c.png')"
bash tests/concurrency_test.sh /tmp/c.png /tmp/concwork
# espera: ALL_CONCURRENCY_PASS
```
Verifica: 30 subidas únicas → 30 trabajos; 12 subidas con la misma
`Idempotency-Key` → 1 solo trabajo; 40 claims en paralelo → 0 duplicados; y un
`printing` viejo se recupera solo.

## 4. E2E mobile (iPhone + Android) con captura de pantallas
Requiere Playwright (no es dependencia del repo) y un Chromium:
```bash
npm install --no-save playwright        # en la raíz del repo
# backend en :8020 y `cd frontend && npm run dev` con
#   frontend/.env.local -> VITE_API_BASE_URL=http://127.0.0.1:8020
python -c "from PIL import Image; Image.new('RGB',(1200,1600),(40,180,90)).save('/tmp/p.png')"
APP_URL=http://127.0.0.1:5173 TEST_IMG=/tmp/p.png SHOTS=/tmp/shots \
  PANEL_PASSWORD=1313 node tests/e2e-mobile.mjs
# espera: MOBILE_E2E_PASS ; deja screenshots en /tmp/shots
```
Emula iPhone 13 y Pixel 7, corre el flujo completo, verifica que el PNG
compuesto sea **1200×1800**, y captura portada/source/crop/nombre/confirmación/
éxito/límite/panel. (Si tu Chromium no es el de Playwright, pásalo con
`CHROME=/ruta/a/chrome`.)
