import { useCallback, useEffect, useRef, useState } from 'react'
import StatusBar from '../components/StatusBar'
import {
  absoluteUrl,
  getQueue,
  panelLogin,
  reprintJob,
  skipJob,
  type QueueResponse,
} from '../lib/api'

// Panel de operador (ruta /panel). Login con clave (PANEL_PASSWORD en el
// backend), luego cola en vivo con miniaturas, saltar y reimprimir, e
// indicador de papel. Mismo skin, más utilitario.
export default function PanelApp() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [clave, setClave] = useState('')
  const [claveErr, setClaveErr] = useState(false)
  const [data, setData] = useState<QueueResponse | null>(null)
  const timer = useRef<number | null>(null)

  const refresh = useCallback(
    async (pw: string) => {
      try {
        setData(await getQueue(pw))
      } catch {
        /* mantener lo último mostrado */
      }
    },
    [],
  )

  useEffect(() => {
    if (!authed) return
    refresh(password)
    timer.current = window.setInterval(() => refresh(password), 4000)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [authed, password, refresh])

  async function login() {
    const ok = await panelLogin(clave.trim())
    if (ok) {
      setPassword(clave.trim())
      setAuthed(true)
      setClaveErr(false)
    } else {
      setClaveErr(true)
    }
  }

  function goHome() {
    window.location.href = '/'
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
              Clave incorrecta, pe.
            </div>
          )}
          <button className="btn" style={{ fontSize: 20 }} onClick={login}>
            ENTRAR
          </button>
        </div>
      </div>
    )
  }

  const jobs = data?.jobs ?? []
  const paperTotal = data?.paper.total ?? 40
  const paperLeft = data?.paper.left ?? paperTotal

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
                  <img
                    src={absoluteUrl(q.thumb_url)}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--hueso)', fontWeight: 700, fontSize: 14 }}>
                    {q.name || 'SIN NOMBRE'}
                  </div>
                  <div style={statusStyle(q.status)}>{statusLabel(q.status)}</div>
                </div>
                {done ? (
                  <button
                    className="qbtn"
                    style={{ borderColor: 'var(--veneno)', color: 'var(--veneno)' }}
                    onClick={() => reprintJob(q.id, password).then(() => refresh(password))}
                  >
                    reimprimir
                  </button>
                ) : (
                  <button
                    className="qbtn"
                    onClick={() => skipJob(q.id, password).then(() => refresh(password))}
                  >
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
