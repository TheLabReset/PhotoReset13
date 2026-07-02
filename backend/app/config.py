"""Configuración leída del entorno. Sin secretos en el código."""
import os

# Carpeta de datos (volumen de Railway montado en /data). PNGs y SQLite viven aquí.
DATA_DIR = os.environ.get("DATA_DIR", "./data")

# Origen del frontend (Netlify) para CORS. Coma-separado si hay varios.
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "")

# Secretos. NUNCA se commitean: van como variables de entorno en cada plataforma.
PRINTER_KEY = os.environ.get("PRINTER_KEY", "")
PANEL_PASSWORD = os.environ.get("PANEL_PASSWORD", "")

# Dimensiones esperadas del PNG final compuesto en el cliente.
EXPECTED_W = 1200
EXPECTED_H = 1776

# Capacidad de papel (para el indicador del panel).
PAPER_TOTAL = int(os.environ.get("PAPER_TOTAL", "120"))

# Un trabajo en 'printing' por más de esto se considera trabado y vuelve a la
# cola (recuperación de cola congelada si el agente muere/se reinicia).
PRINTING_TIMEOUT_S = int(os.environ.get("PRINTING_TIMEOUT_S", "180"))

# Se considera al agente "vivo" si mandó heartbeat/pidió trabajo hace menos que esto.
AGENT_STALE_S = int(os.environ.get("AGENT_STALE_S", "30"))


class ConfigError(RuntimeError):
    pass


def validate_required() -> None:
    """Fail-fast: el backend se niega a arrancar si falta un secreto/origen.

    Mejor no arrancar que arrancar inseguro con defaults vacíos.
    """
    missing = [
        name
        for name, value in (
            ("PRINTER_KEY", PRINTER_KEY),
            ("PANEL_PASSWORD", PANEL_PASSWORD),
            ("FRONTEND_ORIGIN", FRONTEND_ORIGIN),
        )
        if not value.strip()
    ]
    if missing:
        raise ConfigError(
            "Faltan variables de entorno obligatorias: "
            + ", ".join(missing)
            + ". Setéalas en el servicio (Railway) antes de arrancar. "
            "Ver .env.example y README."
        )
    # CORS con credentials + wildcard es una mala configuración (los navegadores
    # la rechazan) y sería un agujero. Rechazar explícitamente.
    if "*" in FRONTEND_ORIGIN:
        raise ConfigError("FRONTEND_ORIGIN no puede ser '*' (se usa allow_credentials).")
