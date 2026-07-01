"""Configuración leída del entorno. Sin secretos en el código."""
import os

# Carpeta de datos (volumen de Railway montado en /data). PNGs y SQLite viven aquí.
DATA_DIR = os.environ.get("DATA_DIR", "./data")

# Origen del frontend (Netlify) para CORS. En dev, permite localhost de Vite.
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")

# Secretos. NUNCA se commitean: van como variables de entorno en cada plataforma.
PRINTER_KEY = os.environ.get("PRINTER_KEY", "")
PANEL_PASSWORD = os.environ.get("PANEL_PASSWORD", "")

# Dimensiones esperadas del PNG final compuesto en el cliente.
EXPECTED_W = 1200
EXPECTED_H = 1800

# Capacidad de papel (para el indicador del panel).
PAPER_TOTAL = int(os.environ.get("PAPER_TOTAL", "40"))
