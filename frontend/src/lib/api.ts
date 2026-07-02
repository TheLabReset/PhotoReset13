// Llamadas al backend.
//
// La URL base viene de una variable de build (VITE_API_BASE_URL). No se
// hardcodea. En dev usa un frontend/.env.local (en gitignore).

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export interface CreateJobResult {
  id: string
  position: number
  duplicate: boolean
}

export type UploadErrorKind = 'offline' | 'network' | 'timeout' | 'paused' | 'server' | 'bad'

export class UploadError extends Error {
  kind: UploadErrorKind
  constructor(kind: UploadErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

// Clave de idempotencia por foto. crypto.randomUUID cubre navegadores modernos;
// fallback simple por si acaso (iOS viejo).
export function newIdempotencyKey(): string {
  try {
    if (crypto && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    /* noop */
  }
  return 'k-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

const UPLOAD_TIMEOUT_MS = 30000
const MAX_ATTEMPTS = 3

function oneUpload(
  blob: Blob,
  name: string,
  idempotencyKey: string,
  onProgress?: (pct: number) => void,
): Promise<CreateJobResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('image', blob, 'reset13.png')
    form.append('name', name)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/api/jobs`)
    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.setRequestHeader('Idempotency-Key', idempotencyKey)

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as CreateJobResult)
        } catch {
          reject(new UploadError('server', 'Respuesta inválida del servidor'))
        }
      } else if (xhr.status === 503) {
        reject(new UploadError('paused', 'Las subidas están en pausa un momento.'))
      } else if (xhr.status >= 400 && xhr.status < 500) {
        reject(new UploadError('bad', `La foto fue rechazada (${xhr.status}).`))
      } else {
        reject(new UploadError('server', `El servidor respondió ${xhr.status}.`))
      }
    }
    xhr.onerror = () =>
      reject(
        new UploadError(
          typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'network',
          'Error de red',
        ),
      )
    xhr.ontimeout = () => reject(new UploadError('timeout', 'Se agotó el tiempo de espera'))
    xhr.send(form)
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Sube el PNG final ya compuesto. Reintenta con backoff ante fallos de red /
// timeout (no ante rechazos 4xx ni pausa). La misma idempotencyKey en cada
// reintento hace que el backend deduplique: nunca se crean dos trabajos.
export async function createJob(
  blob: Blob,
  name: string,
  idempotencyKey: string,
  onProgress?: (pct: number) => void,
): Promise<CreateJobResult> {
  let lastErr: UploadError = new UploadError('network', 'Error de red')
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await oneUpload(blob, name, idempotencyKey, onProgress)
    } catch (e) {
      const err = e instanceof UploadError ? e : new UploadError('network', String(e))
      lastErr = err
      // No reintentar si el server rechazó la foto o pausó: no va a cambiar.
      if (err.kind === 'bad' || err.kind === 'paused') break
      console.warn(`[api] intento ${attempt}/${MAX_ATTEMPTS} falló (${err.kind})`)
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1)) // 1s, 2s
    }
  }
  console.error('[api] subida falló definitivamente:', lastErr.kind, lastErr.message)
  throw lastErr
}

// --- Panel (con clave) ---

export interface QueueJob {
  id: string
  name: string
  status: 'queued' | 'printing' | 'printed' | 'skipped' | 'failed'
  thumb_url: string
  created_at: string
}

export interface AgentStatus {
  last_seen: string | null
  seconds_ago: number | null
  alive: boolean
}

export interface QueueResponse {
  jobs: QueueJob[]
  counts: { total: number; printed: number; queued: number; printing: number }
  // Cartucho KP-108IN (papel + tinta son el mismo consumible). 'left'/'low'
  // alimentan el aviso de cambiar cartucho; 'prints_since_cartridge' lo reporta
  // el agente por heartbeat.
  paper: { total: number; left: number; low: boolean; prints_since_cartridge: number }
  // 'uploads_paused' lo comanda el panel; 'printing_paused' es solo un reflejo
  // de lo que reporta el agente (el panel NO pausa la impresión remotamente).
  controls: { uploads_paused: boolean; printing_paused: boolean }
  agent: AgentStatus
}

async function panelFetch(path: string, password: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${password}` },
  })
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`)
  return res
}

export async function panelLogin(password: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/panel/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) return false
  const data = await res.json()
  return !!data.ok
}

export async function getQueue(password: string): Promise<QueueResponse> {
  const res = await panelFetch('/api/panel/queue', password)
  return res.json()
}

// Miniatura autenticada con Bearer: se descarga con fetch y se envuelve en un
// object URL (la clave NO viaja en la URL de la imagen).
export async function fetchThumb(path: string, password: string): Promise<string> {
  const res = await panelFetch(path, password)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function skipJob(id: string, password: string): Promise<void> {
  await panelFetch(`/api/panel/jobs/${id}/skip`, password, { method: 'POST' })
}

export async function reprintJob(id: string, password: string): Promise<void> {
  await panelFetch(`/api/panel/jobs/${id}/reprint`, password, { method: 'POST' })
}

// El panel solo comanda la pausa de SUBIDAS de invitados. La pausa de impresión
// la gobierna el agente localmente y el panel solo la refleja (controls.printing_paused).
export async function setUploadsPaused(paused: boolean, password: string): Promise<void> {
  await panelFetch('/api/panel/pause', password, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'uploads', paused }),
  })
}
