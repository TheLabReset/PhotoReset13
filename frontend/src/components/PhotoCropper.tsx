import { useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import type { CropArea } from '../lib/compose'

// Recorte 2:3, modo cover (la ventana siempre llena, zoom mínimo = el que cubre;
// react-easy-crop garantiza cover con restrictPosition por defecto). Guarda las
// coordenadas del recorte (croppedAreaPixels), no la imagen.
interface Props {
  src: string
  nameUpper: string
  onCropChange: (area: CropArea) => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4

export default function PhotoCropper({ src, nameUpper, onCropChange }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  return (
    <>
      <div
        className="cropwin"
        style={{ position: 'relative', width: '100%', maxWidth: 300, aspectRatio: '2 / 3' }}
      >
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          aspect={2 / 3}
          objectFit="cover"
          showGrid={true}
          zoomWithScroll={true}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_area: Area, pixels: Area) =>
            onCropChange({
              x: Math.round(pixels.x),
              y: Math.round(pixels.y),
              width: Math.round(pixels.width),
              height: Math.round(pixels.height),
            })
          }
        />
        {/* Overlays de encuadre (no capturan gestos): keyline, degradado y ghost
            del marco para previsualizar "lo que ves es lo que sale". */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 0 2px rgba(242,233,212,.8)',
            zIndex: 5,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(rgba(0,0,0,.45),transparent 20%,transparent 80%,rgba(0,0,0,.6))',
            zIndex: 5,
          }}
        />
        <div
          className="t-anton"
          style={{
            position: 'absolute',
            top: 6,
            left: 0,
            right: 0,
            textAlign: 'center',
            color: '#fff',
            fontSize: 10,
            letterSpacing: '.3em',
            textShadow: '0 1px 2px #000',
            pointerEvents: 'none',
            zIndex: 6,
          }}
        >
          13 AÑOS
        </div>
        <div
          className="t-anton"
          style={{
            position: 'absolute',
            bottom: 6,
            left: 0,
            right: 0,
            textAlign: 'center',
            color: '#fff',
            fontSize: 11,
            letterSpacing: '.06em',
            textShadow: '0 1px 2px #000',
            pointerEvents: 'none',
            zIndex: 6,
          }}
        >
          {nameUpper}
        </div>
      </div>

      {/* slider de zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <span className="t-pixel" style={{ color: 'var(--texto-3)', fontSize: 9 }}>
          –
        </span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span className="t-pixel" style={{ color: 'var(--hueso)', fontSize: 9 }}>
          +
        </span>
      </div>
    </>
  )
}
