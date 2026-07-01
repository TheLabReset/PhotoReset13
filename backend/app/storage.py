"""Guardar/leer el PNG final en el volumen. El backend NO compone nada:
guarda el PNG tal cual llega (Pillow solo valida dimensiones y reencodea por
seguridad)."""
import io
import os
from typing import Optional

from PIL import Image

from .config import DATA_DIR, EXPECTED_H, EXPECTED_W

# Guarda contra "decompression bombs": nunca decodificar más píxeles de los que
# el marco final puede tener (1200x1800 con algo de margen).
Image.MAX_IMAGE_PIXELS = EXPECTED_W * EXPECTED_H * 2


def _photos_dir() -> str:
    d = os.path.join(DATA_DIR, "photos")
    os.makedirs(d, exist_ok=True)
    return d


def photo_path(job_id: str) -> str:
    return os.path.join(_photos_dir(), f"{job_id}.png")


class InvalidImage(Exception):
    pass


def validate_and_clean(raw: bytes) -> Image.Image:
    """Valida que sea un PNG de 1200x1800 y devuelve una copia RGB limpia.

    No recompone ni redimensiona: solo verifica y descarta metadatos. Se llama
    ANTES de crear el trabajo, así una imagen inválida no deja un registro colgado
    en la cola (que luego el agente reclamaría y no encontraría archivo).
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

    clean = Image.new("RGB", img.size)
    clean.paste(img.convert("RGB"))
    return clean


def write_image(job_id: str, img: Image.Image) -> None:
    img.save(photo_path(job_id), format="PNG")


def read_png(job_id: str) -> Optional[bytes]:
    path = photo_path(job_id)
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return f.read()
