// Límite de 2 fotos por dispositivo (localStorage).
//
// Límite blando: se puede saltar con incógnito, y para una fiesta está bien.
// Se descuenta al confirmar un envío exitoso.

const KEY_PHOTOS = 'reset13_photos'
const DEFAULT_PHOTOS = 2

export function getPhotosLeft(): number {
  try {
    const raw = localStorage.getItem(KEY_PHOTOS)
    if (raw === null) return DEFAULT_PHOTOS
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? Math.max(0, n) : DEFAULT_PHOTOS
  } catch {
    return DEFAULT_PHOTOS
  }
}

export function setPhotosLeft(n: number): void {
  try {
    localStorage.setItem(KEY_PHOTOS, String(Math.max(0, n)))
  } catch {
    /* almacenamiento no disponible */
  }
}

// Descuenta una foto (al enviar exitosamente) y devuelve el nuevo total.
export function consumePhoto(): number {
  const next = Math.max(0, getPhotosLeft() - 1)
  setPhotosLeft(next)
  return next
}

// Solo para la demo / botón "reiniciar".
export function resetPhotos(): number {
  setPhotosLeft(DEFAULT_PHOTOS)
  return DEFAULT_PHOTOS
}
