// Carga de fuentes antes de dibujar en canvas.
//
// Punto crítico de composición #2: si Anton/Creepster no están listas cuando
// el canvas escribe texto, se dibuja con la fuente de fallback SIN avisar y la
// impresión no coincide con lo aprobado. Esperamos explícitamente a que las
// fuentes que se hornean estén cargadas.
//
// PERO nunca hay que colgarse esperando una fuente que no carga: hay un timeout.
// Si vence, componemos con lo que haya y registramos el aviso.

// Fuentes que se dibujan dentro del PNG final (compose.ts / stickers.ts):
// Anton (13 AÑOS + nombre), Creepster (sello 13), Space Grotesk (bola 8).
const BAKED_FONTS = ['400 76px "Anton"', '400 40px "Creepster"', '700 24px "Space Grotesk"']

const FONT_TIMEOUT_MS = 4000

let ready: Promise<boolean> | null = null

function timeout(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms))
}

// Devuelve true si las fuentes cargaron, false si venció el timeout (se compone
// igual, con fallback). Nunca rechaza ni se cuelga.
export function ensureFontsReady(): Promise<boolean> {
  if (ready) return ready
  ready = (async () => {
    if (!document.fonts || !document.fonts.load) return false
    const load = (async () => {
      await Promise.all(BAKED_FONTS.map((f) => document.fonts.load(f)))
      await document.fonts.ready
      return true
    })()
    const result = await Promise.race([load, timeout(FONT_TIMEOUT_MS)])
    if (result === 'timeout') {
      console.warn('[fonts] timeout esperando fuentes; se compone con fallback')
      return false
    }
    return true
  })().catch((e) => {
    console.warn('[fonts] error cargando fuentes; se compone con fallback', e)
    return false
  })
  return ready
}
