"""Guardar/leer el PNG final en el volumen. El backend NO compone nada:
guarda el PNG tal cual llega (Pillow solo valida dimensiones y reencodea por
seguridad)."""
import io
import os
from typing import Optional

from PIL import Image

from .config import DATA_DIR, EXPECTED_H, EXPECTED_W


def _photos_dir() -> str:
    d = os.path.join(DATA_DIR, "photos")
    os.makedirs(d, exist_ok=True)
    return d


def photo_path(job_id: str) -> str:
    return os.path.join(_photos_dir(), f"{job_id}.png")


class InvalidImage(Exception):
    pass


def save_png(job_id: str, raw: bytes) -> None:
    """Valida que sea un PNG de 1200x1800 y lo reencodea por seguridad.

    No recompone ni redimensiona el contenido: solo verifica y regraba los
    pixeles tal cual, descartando cualquier metadato potencialmente malicioso.
    """
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:  # noqa: BLE001
        raise InvalidImage("El archivo no es una imagen válida") from exc

    if img.format != "PNG":
        raise InvalidImage("El formato debe ser PNG")
    if img.size != (EXPECTED_W, EXPECTED_H):
        raise InvalidImage(
            f"Dimensiones inválidas: se esperaba {EXPECTED_W}x{EXPECTED_H}, "
            f"llegó {img.size[0]}x{img.size[1]}"
        )

    # Reencode limpio (sin metadatos).
    clean = Image.new("RGB", img.size)
    clean.paste(img.convert("RGB"))
    clean.save(photo_path(job_id), format="PNG")


def read_png(job_id: str) -> Optional[bytes]:
    path = photo_path(job_id)
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return f.read()
