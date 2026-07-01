"""SQLite para la cola, en el volumen. Sin ORM: stdlib nomás.

Bajo concurrencia (muchas subidas simultáneas) usamos WAL + busy_timeout para
que lectores y escritores no se pisen ni tiren 'database is locked'.
"""
import os
import sqlite3
from contextlib import contextmanager

from .config import DATA_DIR

_DB_PATH = os.path.join(DATA_DIR, "queue.db")
_BUSY_TIMEOUT_MS = 30000


def _ensure_dirs() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, "photos"), exist_ok=True)


def init_db() -> None:
    _ensure_dirs()
    with connect() as conn:
        # WAL: escrituras concurrentes + lecturas en paralelo sin bloqueo global.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL DEFAULT '',
                status          TEXT NOT NULL DEFAULT 'queued',
                idempotency_key TEXT UNIQUE,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        conn.commit()


@contextmanager
def connect():
    """Conexión con row_factory de dict y busy_timeout alto (venue wifi con jitter)."""
    conn = sqlite3.connect(_DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute(f"PRAGMA busy_timeout={_BUSY_TIMEOUT_MS}")
    try:
        yield conn
    finally:
        conn.close()


# ---- settings (flags de pausa, heartbeat del agente) ----

def get_setting(key: str, default: str | None = None) -> str | None:
    with connect() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        conn.commit()
