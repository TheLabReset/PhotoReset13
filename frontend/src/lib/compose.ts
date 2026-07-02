// Composición en canvas -> PNG 1200x1776.
//
// Decisión de arquitectura: el CLIENTE compone la imagen final, no el servidor.
// El preview ES la impresión. Los 4 puntos críticos:
//
//   1. Canvas de export a 1200x1776 REAL (no al tamaño del preview) usando la
//      foto original en alta + las coordenadas del recorte.
//   2. Fuentes cargadas antes de dibujar texto (ver ensureFontsReady).
//   3. Stickers random horneados una sola vez (ver stickers.ts / PhotoStyle).
//   4. Orientación EXIF respetada al decodificar la foto (loadOrientedBitmap).
//
// GEOMETRÍA (arreglo del corte de bordes en impresión):
// El papel de la Canon SELPHY es postal 100x148mm. El LIENZO se compone en esa
// proporción: 1200x1776 px = 100x148mm a 12 px/mm (~305 dpi). Como coincide con
// el papel, el agente (modo contain) la imprime 1 a 1, sin recortar bordes.
// Diseño: MARCO de color (negro/rojo) rodeando la foto en una ventana. La foto
// se dibuja desde el bitmap original a resolución completa (sin pérdida). El
// marco (color) sangra a los 4 bordes: el overscan sin bordes solo se come color
// de marco, nunca texto. "13 AÑOS" arriba y logo+nombre abajo van SIEMPRE dentro
// de la zona segura de 96px (8mm). La ventana define la proporción del recorte
// (CROP_ASPECT), así la foto no se distorsiona.

import { ensureFontsReady } from './fonts'
import { drawStickers, type PhotoStyle } from './stickers'

// Lienzo final: 100x148mm @ 12 px/mm (~305 dpi).
export const OUT_W = 1200
export const OUT_H = 1776
// Márgenes de bordes (opción "A" elegida): el texto queda a ~5mm del filo
// (~62px), 2.5× el overscan típico (~2mm) — más fino que los 8mm del spec, por
// decisión de diseño para parecerse a la referencia. La proporción del lienzo ya
// coincide con el papel, así que el agente no recorta de más.
// Marco: bordes de la ventana de la foto (lados 90; arriba 128 / abajo 150).
const BS = 90
const WY = 128 // borde superior (ventana empieza aquí)
const WH = 1498 // alto de la ventana (fondo de ventana en 1626; borde inferior 150)
const WIN_W = OUT_W - BS * 2 // 1020
// Proporción del recorte = proporción de la ventana (evita distorsión).
export const CROP_ASPECT = WIN_W / WH // ≈ 0.681
// Centros verticales del texto. Margen a los filos ~5mm (sobre el overscan
// de ~2mm): título arriba ~62px del filo, nombre ~64px del filo.
const TITLE_Y = 98 // "13 AÑOS" (76px Anton → ~62..126, sobre la ventana en 128)
const NAME_Y = OUT_H - 92 // 1684 → logo/nombre ~1655..1714 (bajo ventana en 1626)

// Coordenadas del recorte en px de la imagen original (= croppedAreaPixels).
export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

// Umbral de baja resolución (aviso no bloqueante).
export function isLowRes(width: number, height: number): boolean {
  return width < 900 || height < 1200
}

// Punto crítico #4: las fotos de celular traen rotación EXIF embebida.
// createImageBitmap con imageOrientation:'from-image' la aplica, así no salen
// de costado en el canvas. Devuelve un bitmap ya orientado.
export async function loadOrientedBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (e) {
    // Fallback para navegadores sin la opción: bitmap sin corrección. Si esto
    // también falla (p.ej. HEIC que el navegador no decodifica), propaga el
    // error para que la UI muestre un mensaje claro y pida reintentar.
    console.warn('[compose] imageOrientation no soportado, usando fallback', e)
    return await createImageBitmap(file)
  }
}

// Cache de imágenes de stickers PNG (solo se cachea el éxito).
const stickerCache: Record<string, HTMLImageElement> = {}
function loadStickerImg(file: string): Promise<HTMLImageElement | null> {
  if (stickerCache[file]) return Promise.resolve(stickerCache[file])
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      stickerCache[file] = img
      resolve(img)
    }
    img.onerror = () => {
      console.warn('[compose] no se pudo cargar el sticker', file)
      resolve(null)
    }
    img.src = '/stickers/' + file
  })
}

let logoCache: HTMLImageElement | null = null
// El logo hueso (blanco) va sobre marco negro Y rojo (ver handoff §Assets).
// Solo cacheamos el éxito: si falla, se reintenta en la próxima foto (no dejar
// un fallo cacheado que deje todas las impresiones sin logo).
function loadLogo(): Promise<HTMLImageElement | null> {
  if (logoCache) return Promise.resolve(logoCache)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      logoCache = img
      resolve(img)
    }
    img.onerror = () => {
      console.warn('[compose] no se pudo cargar el logo /brand/reset-r-hueso.png')
      resolve(null)
    }
    img.src = '/brand/reset-r-hueso.png'
  })
}

export interface ComposeParams {
  bitmap: ImageBitmap
  crop: CropArea
  name: string
  style: PhotoStyle
}

export interface ComposeResult {
  blob: Blob
  dataUrl: string
}

// Compone el PNG final. Determinista: mismas entradas -> misma salida, así el
// preview de confirmación y lo que se sube son idénticos.
export async function composePrint(params: ComposeParams): Promise<ComposeResult> {
  const { bitmap, crop, name, style } = params
  const fontsOk = await ensureFontsReady()
  if (!fontsOk) console.warn('[compose] componiendo sin garantía de fuentes horneadas')
  const logo = await loadLogo()

  // Cargar solo los PNG de stickers que esta foto va a hornear.
  const stickerImgs: Record<string, HTMLImageElement> = {}
  await Promise.all(
    style.placements
      .filter((p) => p.file)
      .map(async (p) => {
        const img = await loadStickerImg(p.file!)
        if (img) stickerImgs[p.file!] = img
      }),
  )

  const wx = BS
  const wy = WY
  const ww = WIN_W
  const wh = WH

  const cv = document.createElement('canvas')
  cv.width = OUT_W
  cv.height = OUT_H
  const x = cv.getContext('2d')!

  const frameColor = style.frameRed ? '#D21F1F' : '#120E0E'

  // Marco: color a todo el lienzo (sangra a los 4 bordes; el overscan solo se
  // come color de marco, nunca texto).
  x.fillStyle = frameColor
  x.fillRect(0, 0, OUT_W, OUT_H)

  // Foto recortada dentro de la ventana (clip), a resolución completa desde el
  // bitmap original (sin pérdida de calidad). El recorte ya viene en la
  // proporción de la ventana, así que 1 a 1 sin distorsión.
  x.save()
  x.beginPath()
  x.rect(wx, wy, ww, wh)
  x.clip()
  try {
    x.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, wx, wy, ww, wh)
  } catch (e) {
    console.warn('[compose] drawImage falló (crop fuera de rango?)', e)
  }
  x.restore()

  // Keyline interior de la ventana.
  x.strokeStyle = 'rgba(255,255,255,0.18)'
  x.lineWidth = 4
  x.strokeRect(wx - 8, wy - 8, ww + 16, wh + 16)

  // "13 AÑOS" arriba (Anton, tracking), dentro de la zona segura.
  x.fillStyle = '#F2E9D4'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  setLetterSpacing(x, '26px')
  x.font = '400 76px "Anton", sans-serif'
  x.fillText('13 AÑOS', OUT_W / 2 + 13, TITLE_Y)
  setLetterSpacing(x, '0px')

  // Logo R + nombre en una línea abajo, dentro de la zona segura.
  const upper = (name || '').toUpperCase()
  x.font = '400 60px "Anton", sans-serif'
  const nameW = upper ? x.measureText(upper).width : 0
  const lw = 58
  const gap = upper ? 18 : 0
  const total = lw + gap + nameW
  const by = NAME_Y
  const cx = OUT_W / 2 - total / 2
  if (logo) x.drawImage(logo, cx, by - lw / 2, lw, lw)
  if (upper) {
    x.textAlign = 'left'
    x.fillStyle = '#F2E9D4'
    x.fillText(upper, cx + lw + gap, by + 2)
  }

  // Punto crítico #3: hornear exactamente los stickers ya decididos. Montan el
  // borde de la ventana (parte sobre el marco, parte sobre la foto).
  drawStickers(
    x,
    { wx, wy, ww, wh, bl: BS, br: BS, bt: WY, bb: OUT_H - (WY + WH) },
    style,
    stickerImgs,
  )

  const blob = await canvasToBlob(cv)
  const dataUrl = cv.toDataURL('image/png')
  return { blob, dataUrl }
}

// letterSpacing en canvas no está en los tipos de TS de forma estándar.
function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  try {
    ;(ctx as unknown as { letterSpacing: string }).letterSpacing = value
  } catch {
    /* navegador sin soporte */
  }
}

function canvasToBlob(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    cv.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('canvas.toBlob devolvió null'))
    }, 'image/png')
  })
}
