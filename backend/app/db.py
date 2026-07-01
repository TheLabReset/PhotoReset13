"""SQLite para la cola, en el volumen. Sin ORM: stdlib nomás."""
import os
import sqlite3
from contextlib import contextmanager

from .config import DATA_DIR

_DB_PATH = os.path.join(DATA_DIR, "queue.db")


def _ensure_dirs() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, "photos"), exist_ok=True)


def init_db() -> None:
    _ensure_dirs()
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL DEFAULT '',
                status      TEXT NOT NULL DEFAULT 'queued',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
            """
        )
        conn.commit()


@contextmanager
def connect():
    """Conexión con row_factory de dict y foreign keys."""
    conn = sqlite3.connect(_DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
