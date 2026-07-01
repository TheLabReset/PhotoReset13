// Carga de fuentes antes de dibujar en canvas.
//
// Punto crítico de composición #2: si Anton/Creepster no están listas cuando
// el canvas escribe texto, se dibuja con la fuente de fallback SIN avisar y la
// impresión no coincide con lo aprobado. Esperamos explícitamente a que las
// fuentes que se hornean estén cargadas.

// Fuentes que se dibujan dentro del PNG final (ver compose.ts / stickers.ts).
const BAKED_FONTS = [
  '400 76px "Anton"',
  '400 60px "Anton"',
  '400 40px "Creepster"',
  '700 24px "Space Grotesk"',
]

let ready: Promise<void> | null = null

export function ensureFontsReady(): Promise<void> {
  if (ready) return ready
  ready = (async () => {
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all(BAKED_FONTS.map((f) => document.fonts.load(f)))
        await document.fonts.ready
      }
    } catch {
      // Si la API de fonts falla, seguimos: el navegador usará lo que tenga.
    }
  })()
  return ready
}
