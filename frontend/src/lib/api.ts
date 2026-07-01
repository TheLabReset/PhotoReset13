// Llamadas al backend.
//
// La URL base viene de una variable de build (VITE_API_BASE_URL). No se
// hardcodea. En dev usa un frontend/.env.local (en gitignore).

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export interface CreateJobResult {
  id: string
  position: number
}

// Sube el PNG final ya compuesto. La subida pública no lleva secreto.
// onProgress reporta 0..100 (usa XHR para tener progreso real, no un spinner).
export function createJob(
  blob: Blob,
  name: string,
  onProgress?: (pct: number) => void,
): Promise<CreateJobResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('image', blob, 'reset13.png')
    form.append('name', name)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}/api/jobs`)

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as CreateJobResult)
        } catch {
          reject(new Error('Respuesta inválida del servidor'))
        }
      } else {
        reject(new Error(`El servidor respondió ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Error de red'))
    xhr.ontimeout = () => reject(new Error('Se agotó el tiempo de espera'))
    xhr.send(form)
  })
}

// --- Panel (con clave) ---

export interface QueueJob {
  id: string
  name: string
  status: 'queued' | 'printing' | 'printed' | 'skipped' | 'failed'
  thumb_url: string
  created_at: string
}

export interface QueueResponse {
  jobs: QueueJob[]
  counts: { total: number; printed: number; queued: number }
  paper: { total: number; left: number }
}

async function panelFetch(path: string, password: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${password}`,
    },
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

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${BASE}${path}`
}

export async function skipJob(id: string, password: string): Promise<void> {
  await panelFetch(`/api/panel/jobs/${id}/skip`, password, { method: 'POST' })
}

export async function reprintJob(id: string, password: string): Promise<void> {
  await panelFetch(`/api/panel/jobs/${id}/reprint`, password, { method: 'POST' })
}
