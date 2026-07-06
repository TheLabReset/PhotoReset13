import { useEffect, useRef, useState } from 'react'
import StatusBar from '../components/StatusBar'
import PhotoCropper from '../components/PhotoCropper'
import {
  composePrint,
  isLowRes,
  loadOrientedBitmap,
  type ComposeResult,
  type CropArea,
} from '../lib/compose'
import { pickPhotoStyle, type PhotoStyle } from '../lib/stickers'
import { createJob, newIdempotencyKey, UploadError } from '../lib/api'
import { consumePhoto, getPhotosLeft } from '../lib/storage'

type Screen =
  | 'portada'
  | 'source'
  | 'crop'
  | 'name'
  | 'confirm'
  | 'sending'
  | 'success'
  | 'error'
  | 'limit'

const MAX_NAME = 18

// Frases cálidas que rotan al azar en Éxito/Límite. Ya no hay impresión en vivo:
// las fotos se guardan y se entregan después, así que el mensaje es de recuerdo
// (no "recógela en la mesa"). Se elige una al azar cada vez que se llega a la
// pantalla, así va cambiando.
const RANDOM_PHRASES = [
  'Espero que recuerdes la noche.',
  'Pronto vas a tener tus fotos.',
  'Feliz Aniversario. Gracias por la foto.',
  'Esa se va directo al recuerdo.',
  '¿Cuánto tomaste, a todo esto?',
  'Nos vemos en la próxima, crack.',
  '¿Con ojeras?',
  '¿Con resaca?',
]
function pickPhrase(): string {
  return RANDOM_PHRASES[Math.floor(Math.random() * RANDOM_PHRASES.length)]
}

export default function GuestApp() {
  const [screen, setScreen] = useState<Screen>('portada')
  const [photosLeft, setPhotosLeft] = useState(2)
  const [phrase, setPhrase] = useState(pickPhrase())

  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const [crop, setCrop] = useState<CropArea>({ x: 0, y: 0, width: 0, height: 0 })
  const [name, setName] = useState('')
  const [style, setStyle] = useState<PhotoStyle>({ frameRed: false, placements: [] })
  const [lowRes, setLowRes] = useState(false)

  const [composed, setComposed] = useState<ComposeResult | null>(null)
  const [composing, setComposing] = useState(false)
  const [composeFailed, setComposeFailed] = useState(false)
  const [progress, setProgress] = useState(0)
  // Error screen: título/subtítulo + qué hace "reintentar" según el contexto.
  const [errInfo, setErrInfo] = useState<{
    title: string
    sub: string
    retryLabel: string
    retry: () => void
  }>({ title: '', sub: '', retryLabel: 'REINTENTAR', retry: () => {} })
  // Clave de idempotencia de la foto actual: se reusa en cada reintento de subida
  // para que el backend deduplique (un doble tap/reintento no crea 2 trabajos).
  const idempKeyRef = useRef<string>('')

  useEffect(() => {
    setPhotosLeft(getPhotosLeft())
  }, [])

  // Liberar el object URL de la foto al desmontar (evita fuga de memoria).
  const imgSrcRef = useRef<string | null>(null)
  imgSrcRef.current = imgSrc
  useEffect(() => {
    return () => {
      if (imgSrcRef.current) URL.revokeObjectURL(imgSrcRef.current)
    }
  }, [])

  // --- navegación ---
  const home = () => setScreen('portada')
  const start = () => {
    setImgSrc(null)
    setName('')
    setComposed(null)
    setComposeFailed(false)
    idempKeyRef.current = ''
    if (getPhotosLeft() > 0) {
      setScreen('source')
    } else {
      setPhrase(pickPhrase())
      setScreen('limit')
    }
  }
  // Acceso del staff al panel (link discreto de la portada). Los invitados NO ven
  // botones al panel en Éxito/Límite: solo el staff entra por acá (con clave).
  const goPanel = () => {
    window.location.href = '/panel'
  }

  function looksHeic(file: File): boolean {
    const t = (file.type || '').toLowerCase()
    const n = (file.name || '').toLowerCase()
    return t.includes('heic') || t.includes('heif') || /\.(heic|heif)$/.test(n)
  }

  // --- elegir foto ---
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0]
    e.target.value = '' // permite re-elegir el mismo archivo
    if (!file) return
    try {
      // Punto crítico: fotos HEIC de iPhone. Intentamos decodificar igual (muchos
      // navegadores/Safari las convierten o decodifican); si no se puede, mensaje
      // claro pidiendo otra foto en vez de un fallo silencioso.
      const bitmap = await loadOrientedBitmap(file)
      bitmapRef.current?.close?.()
      bitmapRef.current = bitmap
      if (imgSrc) URL.revokeObjectURL(imgSrc)
      setImgSrc(URL.createObjectURL(file))
      setLowRes(isLowRes(bitmap.width, bitmap.height))
      setStyle(pickPhotoStyle()) // random horneado UNA vez
      setComposed(null)
      setComposeFailed(false)
      idempKeyRef.current = ''
      setScreen('crop')
    } catch (err) {
      console.error('[guest] no se pudo decodificar la foto', err)
      const heic = looksHeic(file)
      setErrInfo({
        title: 'NO SE PUDO LEER',
        sub: heic
          ? 'Esa foto es HEIC de iPhone y este navegador no la abrió. En Ajustes › Cámara › Formatos elige "Más compatible", o sube otra foto.'
          : 'No pudimos abrir esa foto. Prueba con otra.',
        retryLabel: 'ELEGIR OTRA',
        retry: () => setScreen('source'),
      })
      setScreen('error')
    }
  }

  // --- componer el PNG al entrar a confirmación ---
  async function toConfirm() {
    setScreen('confirm')
    setComposed(null)
    setComposeFailed(false)
    setComposing(true)
    try {
      const bitmap = bitmapRef.current
      if (!bitmap) throw new Error('sin foto')
      const result = await composePrint({ bitmap, crop, name, style })
      setComposed(result)
    } catch (err) {
      console.error('[guest] falló la composición del marco', err)
      setComposeFailed(true)
    } finally {
      setComposing(false)
    }
  }

  // --- enviar ---
  async function submit() {
    // Capturar el blob localmente: la subida no depende de que el estado no cambie.
    const current = composed
    if (!current) return
    if (!idempKeyRef.current) idempKeyRef.current = newIdempotencyKey()

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showOffline()
      return
    }
    setProgress(0)
    setScreen('sending')
    try {
      await createJob(current.blob, name, idempKeyRef.current, (pct) => setProgress(pct))
      // Solo aquí, con subida CONFIRMADA, se descuenta la foto.
      const left = consumePhoto()
      setPhotosLeft(left)
      idempKeyRef.current = '' // consumida; una próxima subida usa clave nueva
      setPhrase(pickPhrase())
      setScreen('success')
    } catch (e) {
      const kind = e instanceof UploadError ? e.kind : 'network'
      console.error('[guest] subida falló:', kind)
      if (kind === 'offline') showOffline()
      else if (kind === 'paused')
        setErrInfoUpload('EN PAUSA', 'El staff pausó las subidas un momento. Reintenta en unos segundos.')
      else if (kind === 'bad')
        setErrInfoUpload('FOTO RECHAZADA', 'Algo salió mal con esa foto. Vuelve a encuadrar y reintenta.')
      else setErrInfoUpload('LA SUBIDA', 'La foto no llegó. Cosas del wifi de evento.')
    }
  }

  function setErrInfoUpload(title: string, sub: string) {
    setErrInfo({ title, sub, retryLabel: 'REINTENTAR', retry: () => void submit() })
    setScreen('error')
  }
  function showOffline() {
    setErrInfo({
      title: 'SIN CONEXIÓN',
      sub: 'Acércate al DJ, ahí llega mejor el wifi.',
      retryLabel: 'REINTENTAR',
      retry: () => void submit(),
    })
    setScreen('error')
  }

  function downloadPrint() {
    if (!composed) return
    const a = document.createElement('a')
    a.href = composed.dataUrl
    a.download = 'reset13-impresion.png'
    a.click()
  }

  // ==== render por pantalla ====
  switch (screen) {
    case 'portada':
      return (
        <div className="scr grain" key="portada">
          <div className="halftone" style={{ position: 'absolute', inset: 0, opacity: 0.6 }} />
          <StatusBar />
          <div
            className="stk ball8"
            style={{ top: 70, right: 22, width: 44, height: 44, animation: 'rise .5s .15s both' }}
          >
            <i style={{ width: 20, height: 20 }}>8</i>
          </div>
          <div className="stk" style={{ top: 128, left: 20, animation: 'rise .5s .5s both' }}>
            <div className="pxheart" style={{ transform: 'scale(.8)' }} />
          </div>
          <div
            className="pbody"
            style={{ justifyContent: 'center', textAlign: 'center', alignItems: 'center' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                marginBottom: 12,
                animation: 'rise .5s .05s both',
              }}
            >
              <div className="logoR" style={{ width: 26, height: 26 }} />
              <span
                className="t-anton"
                style={{ color: 'var(--hueso)', fontSize: 13, letterSpacing: '.32em' }}
              >
                RESET
              </span>
            </div>
            <div
              className="t-drip"
              style={{
                color: 'var(--sangre)',
                fontSize: 150,
                lineHeight: 0.78,
                textShadow: '0 5px 0 #000',
                animation: 'rise .6s .15s both',
              }}
            >
              13
            </div>
            <div
              className="t-anton"
              style={{ color: 'var(--hueso)', fontSize: 27, marginTop: 10, animation: 'rise .5s .3s both' }}
            >
              TRECE AÑOS
            </div>
            <p
              style={{
                color: '#b7ada6',
                fontSize: 14,
                lineHeight: 1.45,
                margin: '16px 8px 0',
                animation: 'rise .5s .45s both',
              }}
            >
              Se vienen cositas.
              <br />
              Deja tu foto para la posteridad.
            </p>
            <button
              className="btn"
              style={{ fontSize: 27, marginTop: 26, animation: 'rise .5s .6s both' }}
              onClick={start}
            >
              DEJA TU FOTO
            </button>
            <div
              style={{
                marginTop: 16,
                font: "400 12px 'Space Grotesk'",
                color: '#7a706c',
                animation: 'rise .5s .72s both',
              }}
            >
              Tienes{' '}
              <span className="t-pixel" style={{ color: 'var(--veneno)', fontSize: 10 }}>
                {photosLeft} FOTOS
              </span>
              , elígelas bien.
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              zIndex: 20,
            }}
          >
            <button className="link" onClick={goPanel}>
              staff
            </button>
          </div>
        </div>
      )

    case 'source':
      return (
        <div className="scr grain" key="source">
          <StatusBar />
          <div className="pbody" style={{ gap: 14 }}>
            <button className="link" style={{ alignSelf: 'flex-start' }} onClick={home}>
              ‹ inicio
            </button>
            <div>
              <span className="t-anton" style={{ color: 'var(--hueso)', fontSize: 34 }}>
                TU FOTO,
                <br />
                TU LEYENDA
              </span>
            </div>
            <p style={{ color: '#9a908a', fontSize: 13, margin: '-4px 0 4px' }}>
              ¿De dónde la sacamos?
            </p>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                justifyContent: 'center',
              }}
            >
              <label
                style={{
                  border: '3px solid var(--sangre)',
                  borderRadius: 6,
                  padding: '24px 20px',
                  background: '#160f0e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  boxShadow: '0 5px 0 #000',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 38,
                    border: '3px solid var(--hueso)',
                    borderRadius: 5,
                    position: 'relative',
                    flex: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      width: 14,
                      height: 14,
                      border: '3px solid var(--hueso)',
                      borderRadius: '50%',
                      top: 8,
                      left: 12,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      width: 14,
                      height: 6,
                      background: 'var(--hueso)',
                      top: -6,
                      left: 12,
                      borderRadius: '3px 3px 0 0',
                    }}
                  />
                </div>
                <div>
                  <div className="t-anton" style={{ color: 'var(--hueso)', fontSize: 24 }}>
                    TOMAR FOTO
                  </div>
                  <div style={{ font: "400 11px 'Space Grotesk'", color: '#8a807a' }}>
                    abre la cámara
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFile}
                  style={{ display: 'none' }}
                />
              </label>
              <label
                style={{
                  border: '3px solid var(--linea)',
                  borderRadius: 6,
                  padding: '24px 20px',
                  background: '#160f0e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 38,
                    border: '3px solid var(--hueso)',
                    borderRadius: 5,
                    position: 'relative',
                    flex: 'none',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: 'var(--brasa)',
                      top: 6,
                      left: 6,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      left: 4,
                      width: 0,
                      height: 0,
                      borderLeft: '14px solid transparent',
                      borderRight: '14px solid transparent',
                      borderBottom: '16px solid var(--hueso)',
                    }}
                  />
                </div>
                <div>
                  <div className="t-anton" style={{ color: 'var(--hueso)', fontSize: 24 }}>
                    SUBIR DE GALERÍA
                  </div>
                  <div style={{ font: "400 11px 'Space Grotesk'", color: '#8a807a' }}>
                    de tu rollo
                  </div>
                </div>
                <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
              </label>
            </div>
            <div style={{ textAlign: 'center', font: "400 11px 'Space Grotesk'", color: '#6a605c' }}>
              Sin filtros raros. Tú y tu cara nomás.
            </div>
          </div>
        </div>
      )

    case 'crop':
      return (
        <div className="scr grain" key="crop">
          <StatusBar />
          <div className="pbody" style={{ gap: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div className="t-anton" style={{ color: 'var(--hueso)', fontSize: 22 }}>
                ENCUADRA
              </div>
              <p style={{ color: '#9a908a', fontSize: 12, margin: '4px 10px 0' }}>
                Arrastra y pellizca. Lo que ves es lo que sale.
              </p>
            </div>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                minHeight: 0,
              }}
            >
              {imgSrc && (
                <PhotoCropper src={imgSrc} onCropChange={setCrop} />
              )}
            </div>
            <div
              className="t-pixel"
              style={{ color: '#4a3f3c', fontSize: 7, textAlign: 'center' }}
            >
              recorte → x:{crop.x} y:{crop.y} · {crop.width}×{crop.height}px
            </div>
            <button className="btn" onClick={() => setScreen('name')}>
              USAR ESTA FOTO
            </button>
            <button
              className="btn gh"
              style={{ fontSize: 14, padding: 9 }}
              onClick={start}
            >
              Cambiar foto
            </button>
          </div>
        </div>
      )

    case 'name':
      return (
        <div className="scr grain" key="name">
          <StatusBar />
          <span
            className="stk seal"
            style={{ top: 74, right: 24, width: 48, height: 48, color: 'var(--sangre)', fontSize: 22 }}
          >
            13
          </span>
          <div className="pbody" style={{ gap: 14 }}>
            <button
              className="link"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setScreen('crop')}
            >
              ‹ encuadre
            </button>
            <div style={{ marginTop: 8 }}>
              <span className="t-anton" style={{ color: 'var(--hueso)', fontSize: 32 }}>
                ¿QUIÉN ERES?
              </span>
            </div>
            <p style={{ color: '#9a908a', fontSize: 13, margin: '-4px 0 8px' }}>
              Va impreso en tu foto y sirve para saber que es tuya.
            </p>
            <div style={{ position: 'relative' }}>
              <input
                className="inp"
                placeholder="Tu nombre o tu apodo"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
                maxLength={MAX_NAME}
              />
              <span
                className="t-marker"
                style={{
                  position: 'absolute',
                  right: 12,
                  top: -14,
                  color: 'var(--brasa)',
                  fontSize: 16,
                  transform: 'rotate(-6deg)',
                }}
              >
                ¡con estilo!
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                font: "400 11px 'Space Grotesk'",
                color: '#6a605c',
              }}
            >
              <span>Opcional, pero recomendado.</span>
              <span className="t-pixel" style={{ fontSize: 8 }}>
                {name.length}/{MAX_NAME}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <div
              style={{
                border: '2px dashed var(--linea)',
                borderRadius: 5,
                padding: '12px 14px',
                color: '#8a807a',
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              Se imprime chiquito abajo del marco, en{' '}
              <span className="t-anton" style={{ color: 'var(--hueso)', letterSpacing: '.05em' }}>
                MAYÚSCULAS
              </span>
              .
            </div>
            <button className="btn" onClick={toConfirm}>
              SIGUIENTE
            </button>
          </div>
        </div>
      )

    case 'confirm':
      return (
        <div className="scr grain" key="confirm">
          <StatusBar />
          <div className="pbody" style={{ gap: 11 }}>
            <div style={{ textAlign: 'center' }}>
              <span className="t-anton" style={{ color: 'var(--hueso)', fontSize: 22 }}>
                ASÍ VA A QUEDAR
              </span>
            </div>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 0,
              }}
            >
              {composed ? (
                <img
                  src={composed.dataUrl}
                  alt="Vista previa de la impresión"
                  style={{
                    maxHeight: '100%',
                    maxWidth: '68%',
                    borderRadius: 3,
                    boxShadow: 'var(--shadow-card)',
                  }}
                />
              ) : composeFailed ? (
                <div style={{ textAlign: 'center', padding: '0 12px' }}>
                  <div className="t-creep" style={{ color: 'var(--sangre)', fontSize: 34 }}>
                    uy
                  </div>
                  <p style={{ color: '#b7ada6', fontSize: 13, lineHeight: 1.4, marginTop: 6 }}>
                    No pudimos armar tu marco. Vuelve a encuadrar y prueba de nuevo.
                  </p>
                </div>
              ) : (
                <div
                  className="t-pixel"
                  style={{ color: '#6a605c', fontSize: 9, textAlign: 'center' }}
                >
                  {composing ? 'ARMANDO TU MARCO…' : 'sin foto'}
                </div>
              )}
            </div>
            {lowRes && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#1a0f08',
                  border: '1.5px solid var(--brasa)',
                  borderRadius: 4,
                  padding: '9px 12px',
                }}
              >
                <span className="t-pixel" style={{ color: 'var(--brasa)', fontSize: 9 }}>
                  !
                </span>
                <span style={{ font: "400 11px 'Space Grotesk'", color: '#e8c3a8' }}>
                  Está media pixeleada, puede salir con poca calidad.
                </span>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#160f0e',
                border: '1.5px solid var(--linea)',
                borderRadius: 4,
                padding: '9px 12px',
              }}
            >
              <span className="t-pixel" style={{ color: 'var(--brasa)', fontSize: 9 }}>
                !
              </span>
              <span style={{ font: "400 11px 'Space Grotesk'", color: '#b7ada6' }}>
                Esto usa <b style={{ color: 'var(--hueso)' }}>1 de tus {photosLeft} fotos</b>. No
                hay vuelta.
              </span>
            </div>
            <button className="btn" onClick={submit} disabled={!composed}>
              ENVIAR MI FOTO
            </button>
            <button
              className="btn gh"
              style={{ fontSize: 15, padding: 10 }}
              onClick={() => setScreen('crop')}
            >
              Volver a encuadrar
            </button>
          </div>
        </div>
      )

    case 'sending':
      return (
        <div className="scr grain" key="sending">
          <StatusBar />
          <div
            className="pbody"
            style={{ justifyContent: 'center', textAlign: 'center', alignItems: 'center' }}
          >
            <div className="t-anton" style={{ color: 'var(--hueso)', fontSize: 30 }}>
              GUARDANDO
              <br />TU FOTO
            </div>
            <p style={{ color: '#8a807a', fontSize: 13, margin: '12px 0 22px' }}>
              No cierres. Ya casi.
            </p>
            <div className="pbar" style={{ width: '100%' }}>
              <i style={{ width: `${Math.max(6, progress)}%` }} />
            </div>
            <div className="t-pixel" style={{ color: 'var(--brasa)', fontSize: 12, marginTop: 14 }}>
              {progress}%
            </div>
          </div>
        </div>
      )

    case 'error':
      return (
        <div className="scr grain" key="error">
          <StatusBar />
          <div
            className="pbody"
            style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 0 }}
          >
            <div className="t-creep" style={{ color: 'var(--sangre)', fontSize: 44 }}>
              se cayó
            </div>
            <div className="t-anton" style={{ color: 'var(--hueso)', fontSize: 24, marginTop: 2 }}>
              {errInfo.title}
            </div>
            <p style={{ color: '#8a807a', fontSize: 13, margin: '10px 18px 22px' }}>{errInfo.sub}</p>
            <button
              className="btn"
              style={{ width: 'auto', padding: '14px 28px' }}
              onClick={errInfo.retry}
            >
              {errInfo.retryLabel}
            </button>
            <button
              className="btn gh"
              style={{ fontSize: 14, padding: 10, marginTop: 12, width: 'auto' }}
              onClick={() => setScreen(composed ? 'confirm' : 'source')}
            >
              ‹ volver
            </button>
          </div>
        </div>
      )

    case 'success':
      return (
        <div className="scr grain" key="success">
          <div className="halftone" style={{ position: 'absolute', inset: 0, opacity: 0.55 }} />
          <StatusBar />
          <div
            className="pbody"
            style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 0 }}
          >
            <div
              className="seal"
              style={{
                width: 116,
                height: 116,
                color: 'var(--veneno)',
                borderWidth: 4,
                animation: 'stamp 1s .1s both',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 22, lineHeight: 0.9 }}>GUAR-</span>
                <span style={{ fontSize: 22, lineHeight: 0.9 }}>DADA</span>
              </div>
            </div>
            <div
              className="t-anton"
              style={{ color: 'var(--hueso)', fontSize: 26, marginTop: 16, animation: 'rise .5s .5s both' }}
            >
              ¡LISTO!
            </div>
            <p
              style={{
                color: '#b7ada6',
                fontSize: 13,
                lineHeight: 1.4,
                margin: '8px 14px 0',
                animation: 'rise .5s .6s both',
              }}
            >
              Tu foto quedó guardada. {phrase}
            </p>
            {composed && (
              <img
                src={composed.dataUrl}
                alt="Tu impresión"
                style={{
                  width: 106,
                  marginTop: 14,
                  borderRadius: 3,
                  boxShadow: '0 10px 24px -8px #000',
                  animation: 'rise .5s .7s both',
                }}
              />
            )}
            <div
              style={{
                marginTop: 14,
                border: '2px solid #2a201f',
                borderRadius: 4,
                padding: '8px 16px',
                animation: 'rise .5s .8s both',
              }}
            >
              {photosLeft <= 0 ? (
                <span>
                  Te quedan{' '}
                  <span className="t-pixel" style={{ color: 'var(--brasa)', fontSize: 13 }}>
                    0 FOTOS
                  </span>
                </span>
              ) : (
                <span>
                  Te queda{' '}
                  <span className="t-pixel" style={{ color: 'var(--veneno)', fontSize: 13 }}>
                    {photosLeft} {photosLeft === 1 ? 'FOTO' : 'FOTOS'}
                  </span>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, animation: 'rise .5s .9s both' }}>
              <button
                className="btn"
                style={{ fontSize: 17, width: 'auto', padding: '12px 20px' }}
                onClick={() => (photosLeft > 0 ? start() : home())}
              >
                {photosLeft > 0 ? 'MANDAR OTRA' : 'AL INICIO'}
              </button>
              <button
                className="btn gh"
                style={{ fontSize: 14, width: 'auto', padding: '12px 15px' }}
                onClick={downloadPrint}
              >
                ↓ PNG
              </button>
            </div>
          </div>
        </div>
      )

    case 'limit':
      return (
        <div className="scr grain" key="limit">
          <StatusBar />
          <div className="stk ball8" style={{ top: 84, left: 26, width: 44, height: 44 }}>
            <i style={{ width: 20, height: 20 }}>8</i>
          </div>
          <div
            className="pbody"
            style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}
          >
            <div
              className="t-pixel"
              style={{ color: 'var(--sangre)', fontSize: 44, lineHeight: 1.2, animation: 'flick 3s infinite' }}
            >
              0/2
            </div>
            <div
              className="t-creep"
              style={{ color: 'var(--hueso)', fontSize: 52, lineHeight: 0.9, marginTop: 14 }}
            >
              ya está
            </div>
            <div className="t-anton" style={{ color: 'var(--sangre)', fontSize: 32, marginTop: 6 }}>
              QUEDARON GUARDADAS
            </div>
            <p style={{ color: '#b7ada6', fontSize: 14, lineHeight: 1.45, margin: '16px 16px 0' }}>
              Ya dejaste tus 2 fotos, crack.
              <br />
              {phrase}
            </p>
            <button
              className="btn gh"
              style={{ fontSize: 14, padding: '10px 18px', marginTop: 24, width: 'auto' }}
              onClick={home}
            >
              Al inicio
            </button>
          </div>
        </div>
      )
  }
}
