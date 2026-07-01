// Cálculo y horneado de stickers random.
//
// Punto crítico de composición #3: la selección/posición de stickers se calcula
// UNA sola vez (al elegir la foto), se guarda en el estado, se muestra en la
// confirmación y se dibuja EXACTAMENTE igual al exportar. Nunca re-randomizar al
// enviar, o la impresión no coincide con lo aprobado.
//
// Portado desde docs/design-handoff/prototipo-13-reset.dc.html (drawStickers).

// Todo lo random de una foto se decide una vez y viaja en este objeto.
export interface PhotoStyle {
  frameRed: boolean // marco rojo (~40%) vs negro
  stk: 0 | 1 | 2 // variante de composición de stickers
}

export function pickPhotoStyle(): PhotoStyle {
  const frameRed = Math.random() < 0.4
  const stk = Math.floor(Math.random() * 3) as 0 | 1 | 2
  return { frameRed, stk }
}

export interface WinGeom {
  wx: number
  wy: number
  ww: number
  wh: number
}

// Color de los stickers: hueso sobre marco rojo, sangre sobre marco negro.
function stickerColor(frameRed: boolean): string {
  return frameRed ? '#F2E9D4' : '#D21F1F'
}

function seal(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) {
  x.save()
  x.translate(cx, cy)
  x.rotate((-9 * Math.PI) / 180)
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
  x.restore()
}

function ball(x: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  x.save()
  x.fillStyle = '#0a0a0a'
  x.beginPath()
  x.arc(cx, cy, r, 0, 7)
  x.fill()
  x.lineWidth = 5
  x.strokeStyle = '#000'
  x.stroke()
  x.fillStyle = '#F2E9D4'
  x.beginPath()
  x.arc(cx, cy, r * 0.46, 0, 7)
  x.fill()
  x.fillStyle = '#000'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.font = '700 ' + Math.round(r * 0.5) + 'px "Space Grotesk", sans-serif'
  x.fillText('8', cx, cy + 2)
  x.restore()
}

function heart(x: CanvasRenderingContext2D, cx: number, cy: number, cell: number, col: string) {
  const rows = ['0110110', '1111111', '1111111', '1111111', '0111110', '0011100', '0001000']
  x.save()
  x.fillStyle = col
  const w = rows[0].length
  const h = rows.length
  const ox = cx - (w * cell) / 2
  const oy = cy - (h * cell) / 2
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++)
      if (rows[r][c] === '1') x.fillRect(ox + c * cell, oy + r * cell, cell - 1, cell - 1)
  x.restore()
}

// Dibuja EXACTAMENTE los stickers de esta foto sobre el canvas final.
export function drawStickers(
  x: CanvasRenderingContext2D,
  g: WinGeom,
  style: PhotoStyle,
) {
  const col = stickerColor(style.frameRed)
  const v = style.stk
  if (v === 0) {
    seal(x, g.wx + g.ww - 24, g.wy + 34, 50, col)
    ball(x, g.wx + 44, g.wy + g.wh - 52, 46)
  } else if (v === 1) {
    heart(x, g.wx + 50, g.wy + 50, 10, col)
    ball(x, g.wx + g.ww - 44, g.wy + 44, 44)
  } else {
    seal(x, g.wx + 44, g.wy + 38, 48, col)
    heart(x, g.wx + g.ww - 50, g.wy + g.wh - 50, 10, col)
  }
}
