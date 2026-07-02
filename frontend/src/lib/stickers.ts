// Cálculo y horneado de stickers random.
//
// Punto crítico de composición #3: la selección/posición/rotación de stickers se
// calcula UNA sola vez (al elegir la foto), se guarda en el estado, se muestra en
// la confirmación y se dibuja EXACTAMENTE igual al exportar. Nunca re-randomizar
// al enviar, o la impresión no coincide con lo aprobado.
//
// Hay dos familias que se combinan:
//  - Procedurales (dibujados por código): bola 8, sello "13" (Creepster), corazón pixel.
//  - PNG del sticker sheet (arte del cliente en /public/stickers).
// Se hornean hasta 4 por marco, repartidos en las esquinas de la ventana (sobre
// la foto), nunca sobre el nombre (que va en la banda inferior, fuera de la ventana).

// PNG disponibles en /public/stickers (kebab-case, recortados y optimizados).
export const PNG_STICKERS = [
  'ave-13.png',
  'le-falta-aji.png',
  'not-old.png',
  'susy.png',
  'juventud-experiencia.png',
  'love-reset.png',
] as const

type ProcKind = 'seal' | 'ball' | 'heart'
type Corner = 'tl' | 'tr' | 'bl' | 'br'

export interface StickerPlacement {
  kind: ProcKind | 'png'
  file?: string // solo para kind 'png'
  corner: Corner
  rot: number // grados
  size: number // px en canvas: png = lado mayor; seal/ball = radio; heart = celda
}

// Todo lo random de una foto se decide una vez y viaja en este objeto.
export interface PhotoStyle {
  frameRed: boolean // marco rojo (~40%) vs negro
  placements: StickerPlacement[]
}

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br']

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pickPhotoStyle(): PhotoStyle {
  const frameRed = Math.random() < 0.4

  // Pool combinado: procedurales + PNG.
  const pool: Array<{ kind: ProcKind | 'png'; file?: string }> = [
    { kind: 'seal' },
    { kind: 'ball' },
    { kind: 'heart' },
    ...PNG_STICKERS.map((file) => ({ kind: 'png' as const, file })),
  ]

  const count = 2 + Math.floor(Math.random() * 3) // 2, 3 o 4
  const chosen = shuffle(pool).slice(0, count)
  const corners = shuffle(CORNERS).slice(0, count)

  const placements: StickerPlacement[] = chosen.map((c, i) => ({
    kind: c.kind,
    file: c.file,
    corner: corners[i],
    rot: rand(-14, 14),
    size:
      c.kind === 'png'
        ? rand(300, 360) // ilustración: lado mayor
        : c.kind === 'seal'
          ? rand(46, 54) // radio
          : c.kind === 'ball'
            ? rand(42, 50) // radio
            : rand(9, 11), // heart: celda
  }))

  return { frameRed, placements }
}

// ---- dibujo (todo centrado en el origen; el caller ubica/rota) ----

function stickerColor(frameRed: boolean): string {
  return frameRed ? '#F2E9D4' : '#D21F1F'
}

function sealAt(x: CanvasRenderingContext2D, r: number, col: string) {
  x.strokeStyle = col
  x.lineWidth = 6
  x.beginPath()
  x.arc(0, 0, r, 0, 7)
  x.stroke()
  x.fillStyle = col
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.font = '400 ' + Math.round(r * 1.25) + 'px "Creepster", cursive'
  x.fillText('13', 0, 4)
}

function ballAt(x: CanvasRenderingContext2D, r: number) {
  x.fillStyle = '#0a0a0a'
  x.beginPath()
  x.arc(0, 0, r, 0, 7)
  x.fill()
  x.lineWidth = 5
  x.strokeStyle = '#000'
  x.stroke()
  x.fillStyle = '#F2E9D4'
  x.beginPath()
  x.arc(0, 0, r * 0.46, 0, 7)
  x.fill()
  x.fillStyle = '#000'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.font = '700 ' + Math.round(r * 0.5) + 'px "Space Grotesk", sans-serif'
  x.fillText('8', 0, 2)
}

function heartAt(x: CanvasRenderingContext2D, cell: number, col: string) {
  const rows = ['0110110', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000']
  x.fillStyle = col
  const w = rows[0].length
  const h = rows.length
  const ox = -(w * cell) / 2
  const oy = -(h * cell) / 2
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      if (rows[r][c] === '1') x.fillRect(ox + c * cell, oy + r * cell, cell - 1, cell - 1)
}

export interface WinGeom {
  wx: number
  wy: number
  ww: number
  wh: number
}

// Semi-ancho/alto que ocupa el sticker (para insetarlo dentro de la esquina).
function halfSize(p: StickerPlacement, img?: HTMLImageElement): { hw: number; hh: number } {
  if (p.kind === 'png') {
    const ar = img && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1
    const w = ar >= 1 ? p.size : p.size * ar
    const h = ar >= 1 ? p.size / ar : p.size
    return { hw: w / 2, hh: h / 2 }
  }
  if (p.kind === 'heart') return { hw: 3.5 * p.size, hh: 3.5 * p.size }
  return { hw: p.size, hh: p.size } // seal/ball: radio
}

// Dibuja EXACTAMENTE los stickers horneados. `imgs` mapea file -> imagen cargada.
export function drawStickers(
  x: CanvasRenderingContext2D,
  g: WinGeom,
  style: PhotoStyle,
  imgs: Record<string, HTMLImageElement>,
) {
  const col = stickerColor(style.frameRed)
  const margin = 18
  for (const p of style.placements) {
    const img = p.file ? imgs[p.file] : undefined
    const { hw, hh } = halfSize(p, img)
    const cx =
      p.corner === 'tl' || p.corner === 'bl' ? g.wx + margin + hw : g.wx + g.ww - margin - hw
    const cy =
      p.corner === 'tl' || p.corner === 'tr' ? g.wy + margin + hh : g.wy + g.wh - margin - hh
    x.save()
    x.translate(cx, cy)
    x.rotate((p.rot * Math.PI) / 180)
    if (p.kind === 'png' && img) {
      x.drawImage(img, -hw, -hh, hw * 2, hh * 2)
    } else if (p.kind === 'seal') {
      sealAt(x, p.size, col)
    } else if (p.kind === 'ball') {
      ballAt(x, p.size)
    } else if (p.kind === 'heart') {
      heartAt(x, p.size, col)
    }
    x.restore()
  }
}
