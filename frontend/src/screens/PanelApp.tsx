import { useCallback, useEffect, useRef, useState } from 'react'
import StatusBar from '../components/StatusBar'
import {
  fetchThumb,
  getQueue,
  panelLogin,
  reprintJob,
  setPause,
  skipJob,
  type QueueResponse,
} from '../lib/api'

// Panel de operador (ruta /panel). Login con clave (PANEL_PASSWORD), luego cola
// en vivo con miniaturas (autenticadas), saltar/reimprimir/reencolar, indicador
// de papel, estado del agente (heartbeat) e interruptores de pausa.
export default function PanelApp() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [clave, setClave] = useState('')
  const [claveErr, setClaveErr] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [data, setData] = useState<QueueResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const thumbsRef = useRef<Record<string, string>>({})
  const timer = useRef<number | null>(null)

  const refresh = useCallback(async (pw: string) => {
    try {
      const d = await getQueue(pw)
      setData(d)
      setErr(null)
    } catch {
      setErr('Se perdió la conexión con el servidor. Reintentando…')
    }
  }, [])

  useEffect(() => {
    if (!authed) return
    refresh(password)
    timer.current = window.setInterval(() => refresh(password), 4000)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [authed, password, refresh])

  // Cargar miniaturas faltantes (fetch con Bearer -> object URL). Cachea por id.
  useEffect(() => {
    if (!authed || !data) return
    let cancelled = false
    ;(async () => {
      for (const j of data.jobs) {
        if (thumbsRef.current[j.id]) continue
        try {
          const url = await fetchThumb(j.thumb_url, password)
          if (cancelled) {
            URL.revokeObjectURL(url)
            return
          }
          thumbsRef.current = { ...thumbsRef.current, [j.id]: url }
          setThumbs(thumbsRef.current)
        } catch {
          /* miniatura opcional */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authed, data, password])

  // Revocar todos los object URLs al desmontar.
  useEffect(() => {
    return () => {
      Object.values(thumbsRef.current).forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  async function login() {
    setLoggingIn(true)
    try {
      const ok = await panelLogin(clave.trim())
      if (ok) {
        setPassword(clave.trim())
        setAuthed(true)
        setClaveErr(false)
      } else {
        setClaveErr(true)
      }
    } catch {
      setClaveErr(true)
      setErr('No se pudo contactar al servidor.')
    } finally {
      setLoggingIn(false)
    }
  }

  function goHome() {
    window.location.href = '/'
  }

  async function act(fn: () => Promise<void>, label: string) {
    try {
      await fn()
      await refresh(password)
    } catch {
      setErr(`No se pudo ${label}. Reintenta.`)
    }
  }

  async function togglePause(target: 'uploads' | 'printing', next: boolean) {
    try {
      await setPause(target, next, password)
      await refresh(password)
    } catch {
      setErr('No se pudo cambiar la pausa.')
    }
  }

  if (!authed) {
    return (
      <div className="scr grain" key="staff">
        <StatusBar />
        <div className="pbody" style={{ justifyContent: 'center', gap: 16 }}>
          <button
            className="link"
            style={{ alignSelf: 'flex-start', position: 'absolute', top: 52, left: 26 }}
            onClick={goHome}
          >
            ‹ salir
          </button>
          <div style={{ textAlign: 'center' }}>
            <div className="logoR" style={{ width: 34, height: 34, margin: '0 auto 10px' }} />
            <div className="t-anton" style={{ color: 'var(--hueso)', fontSize: 24 }}>
              PANEL DE COLA
            </div>
            <div className="t-pixel" style={{ color: 'var(--sangre)', fontSize: 9, marginTop: 8 }}>
              SOLO STAFF
            </div>
          </div>
          <input
            className="inp"
            style={{ textAlign: 'center', letterSpacing: '.3em', animation: claveErr ? 'shake .4s' : undefined }}
            type="password"
            placeholder="Clave del evento"
            value={clave}
            onChange={(e) => {
              setClave(e.target.value)
              setClaveErr(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') login()
            }}
          />
          {claveErr && (
            <div
              style={{
                textAlign: 'center',
                color: 'var(--sangre)',
                font: "500 12px 'Space Grotesk'",
                marginTop: -8,
              }}
            >
              {err || 'Clave incorrecta, pe.'}
            </div>
          )}
          <button className="btn" style={{ fontSize: 20 }} onClick={login} disabled={loggingIn}>
            {loggingIn ? 'ENTRANDO…' : 'ENTRAR'}
          </button>
        </div>
      </div>
    )
  }

  const jobs = data?.jobs ?? []
  const paperTotal = data?.paper.total ?? 40
  const paperLeft = data?.paper.left ?? paperTotal
  const controls = data?.controls ?? { uploads_paused: false, printing_paused: false }
  const agent = data?.agent

  return (
    <div className="scr grain" key="queue">
      <StatusBar />
      <div
        style={{
          padding: '14px 18px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid #2a201f',
        }}
      >
        <div>
          <div className="t-anton" style={{ color: 'var(--hueso)', fontSize: 22 }}>
            COLA EN VIVO
          </div>
          <button className="link" style={{ padding: '2px 0' }} onClick={goHome}>
            ‹ inicio
          </button>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="t-pixel" style={{ color: 'var(--veneno)', fontSize: 9 }}>
            PAPEL {paperLeft}/{paperTotal}
          </div>
          <div style={{ font: "400 9px 'Space Grotesk'", color: '#6a605c' }}>
            quedan {paperLeft} hojas
          </div>
        </div>
      </div>

      {/* estado del agente + interruptores */}
      <div
        style={{
          padding: '10px 18px',
          borderBottom: '2px solid #2a201f',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              flex: 'none',
              background: agent?.alive ? 'var(--veneno)' : 'var(--sangre)',
              boxShadow: agent?.alive ? '0 0 6px var(--veneno)' : 'none',
            }}
          />
          <span style={{ font: "400 11px 'Space Grotesk'", color: '#b7ada6' }}>
            {agent?.alive
              ? 'Impresora conectada'
              : agent?.seconds_ago != null
                ? `Agente sin señal (hace ${agent.seconds_ago}s)`
                : 'Agente nunca visto'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="qbtn"
            style={pauseBtnStyle(controls.printing_paused)}
            onClick={() => togglePause('printing', !controls.printing_paused)}
          >
            {controls.printing_paused ? '▶ reanudar impresión' : '⏸ pausar impresión'}
          </button>
          <button
            className="qbtn"
            style={pauseBtnStyle(controls.uploads_paused)}
            onClick={() => togglePause('uploads', !controls.uploads_paused)}
          >
            {controls.uploads_paused ? '▶ reanudar subidas' : '⏸ pausar subidas'}
          </button>
        </div>
        {err && (
          <div style={{ color: 'var(--brasa)', font: "500 10px 'Space Grotesk'" }}>{err}</div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {jobs.length === 0 ? (
          <div
            style={{
              padding: '60px 24px',
              textAlign: 'center',
              color: '#6a605c',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Cola vacía.
            <br />
            Manda una foto desde el flujo para verla acá.
          </div>
        ) : (
          jobs.map((q) => {
            const printing = q.status === 'printing'
            const done = q.status === 'printed'
            return (
              <div
                className="qrow"
                key={q.id}
                style={{
                  background: printing ? '#170f0e' : undefined,
                  borderLeft: printing ? '3px solid var(--brasa)' : undefined,
                  opacity: done ? 0.72 : 1,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 57,
                    borderRadius: 2,
                    flex: 'none',
                    overflow: 'hidden',
                    background: '#1c141c',
                    position: 'relative',
                  }}
                >
                  {thumbs[q.id] && (
                    <img
                      src={thumbs[q.id]}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--hueso)', fontWeight: 700, fontSize: 14 }}>
                    {q.name || 'SIN NOMBRE'}
                  </div>
                  <div style={statusStyle(q.status)}>{statusLabel(q.status)}</div>
                </div>
                {printing ? (
                  <button className="qbtn" onClick={() => act(() => reprintJob(q.id, password), 'reencolar')}>
                    reencolar
                  </button>
                ) : done ? (
                  <button
                    className="qbtn"
                    style={{ borderColor: 'var(--veneno)', color: 'var(--veneno)' }}
                    onClick={() => act(() => reprintJob(q.id, password), 'reimprimir')}
                  >
                    reimprimir
                  </button>
                ) : (
                  <button className="qbtn" onClick={() => act(() => skipJob(q.id, password), 'saltar')}>
                    saltar
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function pauseBtnStyle(active: boolean): React.CSSProperties {
  return active
    ? { borderColor: 'var(--brasa)', color: 'var(--brasa)', fontSize: 11 }
    : { fontSize: 11 }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'printing':
      return 'IMPRIMIENDO…'
    case 'printed':
      return 'LISTO ✓'
    case 'skipped':
      return 'saltado'
    case 'failed':
      return 'falló'
    default:
      return 'en cola'
  }
}

function statusStyle(status: string): React.CSSProperties {
  if (status === 'printing')
    return { color: 'var(--brasa)', fontFamily: 'var(--f-pixel)', fontSize: 8, marginTop: 3 }
  if (status === 'printed')
    return { color: 'var(--veneno)', fontFamily: 'var(--f-pixel)', fontSize: 8, marginTop: 3 }
  return { color: '#8a807a', font: "400 10px 'Space Grotesk'", marginTop: 3 }
}
