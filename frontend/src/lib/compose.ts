// Composición en canvas -> PNG 1200x1800.
//
// Decisión de arquitectura: el CLIENTE compone la imagen final, no el servidor.
// El preview ES la impresión. Aquí se apilan foto recortada + marco + stickers +
// nombre en un canvas a resolución completa. Los 4 puntos críticos:
//
//   1. Canvas de export a 1200x1800 REAL (no al tamaño del preview) usando la
//      foto original en alta + las coordenadas del recorte.
//   2. Fuentes cargadas antes de dibujar texto (ver ensureFontsReady).
//   3. Stickers random horneados una sola vez (ver stickers.ts / PhotoStyle).
//   4. Orientación EXIF respetada al decodificar la foto (loadOrientedBitmap).
//
// Portado desde docs/design-handoff/prototipo-13-reset.dc.html (compose()).

import { ensureFontsReady } from './fonts'
import { drawStickers, type PhotoStyle } from './stickers'

// Lienzo final: 2:3, 4"x6" @300dpi.
export const OUT_W = 1200
export const OUT_H = 1800
// Bordes del marco sobre 1200px: lados 90, arriba 120, abajo 150.
const BS = 90
const BT = 120
const BB = 150

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
  const wy = BT
  const ww = OUT_W - BS * 2 // 1020
  const wh = OUT_H - BT - BB // 1530

  const cv = document.createElement('canvas')
  cv.width = OUT_W
  cv.height = OUT_H
  const x = cv.getContext('2d')!

  // Fondo = marco (negro o rojo, ya decidido en style).
  x.fillStyle = style.frameRed ? '#D21F1F' : '#120E0E'
  x.fillRect(0, 0, OUT_W, OUT_H)

  // Foto recortada dentro de la ventana (clip), modo cover con rect fuente.
  x.save()
  x.beginPath()
  x.rect(wx, wy, ww, wh)
  x.clip()
  try {
    x.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, wx, wy, ww, wh)
  } catch (e) {
    // rect fuente fuera de rango: dejar el fondo del marco, pero avisar.
    console.warn('[compose] drawImage falló (crop fuera de rango?)', e)
  }
  x.restore()

  // Keyline interior.
  x.strokeStyle = 'rgba(255,255,255,0.18)'
  x.lineWidth = 4
  x.strokeRect(wx - 8, wy - 8, ww + 16, wh + 16)

  // "13 AÑOS" arriba (Anton, tracking).
  x.fillStyle = '#F2E9D4'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  setLetterSpacing(x, '26px')
  x.font = '400 76px "Anton", sans-serif'
  x.fillText('13 AÑOS', OUT_W / 2 + 13, BT / 2 + 2)
  setLetterSpacing(x, '0px')

  // Logo R + nombre en una línea abajo.
  const upper = (name || '').toUpperCase()
  x.font = '400 60px "Anton", sans-serif'
  const nameW = upper ? x.measureText(upper).width : 0
  const lw = 58
  const gap = upper ? 18 : 0
  const total = lw + gap + nameW
  const by = OUT_H - BB / 2
  const cx = OUT_W / 2 - total / 2
  if (logo) x.drawImage(logo, cx, by - lw / 2, lw, lw)
  if (upper) {
    x.textAlign = 'left'
    x.fillStyle = '#F2E9D4'
    x.fillText(upper, cx + lw + gap, by + 2)
  }

  // Punto crítico #3: hornear exactamente los stickers ya decididos.
  drawStickers(x, { wx, wy, ww, wh, bl: BS, br: BS, bt: BT, bb: BB }, style, stickerImgs)

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
