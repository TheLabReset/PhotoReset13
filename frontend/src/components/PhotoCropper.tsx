import { useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { CROP_ASPECT, type CropArea } from '../lib/compose'

// Recorte a la proporción de la VENTANA de la foto (CROP_ASPECT), modo cover (la
// ventana siempre llena, zoom mínimo = el que cubre; react-easy-crop garantiza
// cover con restrictPosition por defecto). Guarda las coordenadas
// (croppedAreaPixels), no la imagen. La ventana muestra EXACTAMENTE la foto que
// sale impresa dentro del marco (el "13 AÑOS" y el nombre van en los bordes del
// marco, fuera de la ventana), así lo que encuadras es lo que se imprime.
interface Props {
  src: string
  onCropChange: (area: CropArea) => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4

export default function PhotoCropper({ src, onCropChange }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  return (
    <>
      <div
        className="cropwin"
        style={{ position: 'relative', width: '100%', maxWidth: 300, aspectRatio: `${CROP_ASPECT}` }}
      >
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          aspect={CROP_ASPECT}
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
        {/* Keyline de la ventana. Sin degradado ni ghost de texto: la ventana
            muestra tal cual la foto que sale (el texto va en el marco, fuera). */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 0 2px rgba(242,233,212,.8)',
            zIndex: 5,
          }}
        />
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
