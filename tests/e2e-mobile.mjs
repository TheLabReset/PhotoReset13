// E2E mobile del flujo del invitado + panel, con captura de pantallas.
// Corre en Chromium con emulación de iPhone y Android. Ver tests/README.md.
//
// Requiere Playwright (no es dependencia del proyecto):
//   cd frontend && npm install --no-save playwright
// Y un backend + `npm run dev` corriendo (ver README).
import { chromium, devices } from 'playwright'

const APP = process.env.APP_URL || 'http://127.0.0.1:5173'
const IMG = process.env.TEST_IMG // PNG/JPEG de prueba (retrato)
const SHOTS = process.env.SHOTS || '.'
const CHROME = process.env.CHROME // opcional: ruta a un Chromium ya instalado

const launchOpts = { headless: true, args: ['--no-sandbox'] }
if (CHROME) launchOpts.executablePath = CHROME
const browser = await chromium.launch(launchOpts)
let failures = 0
const log = (...a) => console.log(...a)

async function runFlow(name, device, shoot) {
  const ctx = await browser.newContext({ ...device })
  const page = await ctx.newPage()
  await page.goto(APP, { waitUntil: 'networkidle' })
  if (shoot) await page.screenshot({ path: `${SHOTS}/app-01-portada.png` })
  await page.getByText('QUIERO IMPRIMIR').click()
  if (shoot) await page.screenshot({ path: `${SHOTS}/app-02-source.png` })
  await page.locator('input[type=file]').last().setInputFiles(IMG)
  await page.getByText('ENCUADRA').waitFor({ timeout: 15000 })
  if (shoot) await page.screenshot({ path: `${SHOTS}/app-03-crop.png` })
  await page.getByText('USAR ESTA FOTO').click()
  await page.getByText('¿QUIÉN ERES?').waitFor()
  await page.locator('input.inp').fill('MAJO CH.')
  if (shoot) await page.screenshot({ path: `${SHOTS}/app-04-name.png` })
  await page.getByText('SIGUIENTE').click()
  await page.getByText('ASÍ SE VA A IMPRIMIR').waitFor()
  const preview = page.locator('img[alt="Vista previa de la impresión"]')
  await preview.waitFor({ timeout: 15000 })
  const dims = await preview.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight }))
  log(`[${name}] preview dims ${JSON.stringify(dims)}`)
  if (dims.w !== 1200 || dims.h !== 1800) { log(`[${name}] FAIL dims`); failures++ }
  if (shoot) await page.screenshot({ path: `${SHOTS}/app-05-confirm.png` })
  await page.getByText('ENVIAR A IMPRIMIR').click()
  await page.getByText('¡LISTO!').waitFor({ timeout: 20000 })
  log(`[${name}] success OK`)
  if (shoot) await page.screenshot({ path: `${SHOTS}/app-06-success.png` })
  await ctx.close()
}

await runFlow('iPhone 13', devices['iPhone 13'], true)
await runFlow('Pixel 7', devices['Pixel 7'] || devices['Pixel 5'], false)

// Pantalla de límite (forzar 0 fotos).
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.setItem('reset13_photos', '0'))
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.getByText('QUIERO IMPRIMIR').click()
  await page.getByText('VE POR UN TRAGO').waitFor({ timeout: 8000 })
  await page.screenshot({ path: `${SHOTS}/app-07-limite.png` })
  log('[limit] OK')
  await ctx.close()
}

// Panel (login + cola). Usa la clave del panel del backend de prueba.
{
  const pw = process.env.PANEL_PASSWORD || '1313'
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  await page.goto(APP + '/panel', { waitUntil: 'networkidle' })
  await page.getByText('PANEL DE COLA').waitFor()
  await page.screenshot({ path: `${SHOTS}/app-08-panel-login.png` })
  await page.locator('input[type=password]').fill(pw)
  await page.getByText('ENTRAR').click()
  await page.getByText('COLA EN VIVO').waitFor({ timeout: 8000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/app-09-panel-queue.png` })
  log('[panel] OK')
  await ctx.close()
}

await browser.close()
log(failures === 0 ? 'MOBILE_E2E_PASS' : 'MOBILE_E2E_FAIL')
process.exit(failures === 0 ? 0 : 1)
