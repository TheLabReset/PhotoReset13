"""Operaciones sobre la cola de trabajos (Job) y flags de operación."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from .config import AGENT_STALE_S, PRINTING_TIMEOUT_S
from .db import connect, get_setting, set_setting
from .logging_setup import get_logger

log = get_logger("queue")

# Estados válidos de un trabajo.
STATUSES = {"queued", "printing", "printed", "skipped", "failed"}

# Claves de settings.
S_UPLOADS_PAUSED = "uploads_paused"  # lo comanda el PANEL (flag del backend)
# Estado de pausa de IMPRESIÓN que reporta el agente. El agente gobierna su
# propia pausa localmente (por seguridad, para no quedar pausado si se cae la
# red). El backend solo lo GUARDA y el panel lo REFLEJA; nadie lo comanda remoto.
S_AGENT_PRINTING_PAUSED = "agent_printing_paused"
# Impresiones desde el último cambio de cartucho (reportado por el agente).
S_PRINTS_SINCE_CARTRIDGE = "prints_since_cartridge"
S_AGENT_LAST_SEEN = "agent_last_seen"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def create_job(name: str, idempotency_key: Optional[str] = None) -> tuple[dict, bool]:
    """Crea un trabajo. Devuelve (job, created).

    Idempotencia: si llega otra vez la misma idempotency_key (doble tap, reintento
    de red), NO se crea un segundo trabajo — se devuelve el existente. Así un
    reintento no gasta dos fotos ni imprime dos veces.
    """
    if idempotency_key:
        existing = get_job_by_key(idempotency_key)
        if existing:
            log.info("dedupe idempotency_key=%s -> job=%s", idempotency_key, existing["id"])
            return existing, False

    job_id = uuid.uuid4().hex
    ts = _iso(_now())
    with connect() as conn:
        try:
            conn.execute(
                "INSERT INTO jobs (id, name, status, idempotency_key, created_at, updated_at) "
                "VALUES (?, ?, 'queued', ?, ?, ?)",
                (job_id, name, idempotency_key, ts, ts),
            )
            conn.commit()
        except Exception:
            # Carrera: dos requests con la misma key a la vez. Devolver el que ganó.
            conn.rollback()
            if idempotency_key:
                existing = get_job_by_key(idempotency_key)
                if existing:
                    return existing, False
            raise
    log.info("job created id=%s name=%r", job_id, name)
    return (
        {"id": job_id, "name": name, "status": "queued", "created_at": ts, "updated_at": ts},
        True,
    )


def delete_job(job_id: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        conn.commit()


def get_job(job_id: str) -> Optional[dict]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def get_job_by_key(key: str) -> Optional[dict]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE idempotency_key = ?", (key,)).fetchone()
    return dict(row) if row else None


def position_of(job_id: str) -> int:
    """1-indexado: cuántos trabajos activos hay hasta este (incl.)."""
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','printing') "
            "AND created_at <= (SELECT created_at FROM jobs WHERE id = ?)",
            (job_id,),
        ).fetchone()
    return int(row["n"]) if row else 1


def list_jobs() -> list[dict]:
    """Imprimiendo primero, luego en cola (más antiguo primero), luego el resto."""
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM jobs
            ORDER BY
              CASE status
                WHEN 'printing' THEN 0
                WHEN 'queued'   THEN 1
                ELSE 2
              END,
              CASE WHEN status IN ('printing','queued') THEN created_at END ASC,
              updated_at DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def recover_stuck(timeout_s: int = PRINTING_TIMEOUT_S) -> int:
    """Recupera cola trabada: 'printing' viejo -> 'queued'.

    Si el agente muere/reinicia con un trabajo en 'printing', sin esto la cola se
    congela para siempre. Devuelve cuántos se recuperaron.
    """
    cutoff = _iso(datetime.fromtimestamp(_now().timestamp() - timeout_s, tz=timezone.utc))
    ts = _iso(_now())
    with connect() as conn:
        cur = conn.execute(
            "UPDATE jobs SET status = 'queued', updated_at = ? "
            "WHERE status = 'printing' AND updated_at < ?",
            (ts, cutoff),
        )
        conn.commit()
        n = cur.rowcount
    if n:
        log.warning("recovered %d stuck 'printing' job(s) back to 'queued'", n)
    return n


def claim_next() -> Optional[dict]:
    """Toma atómicamente el 'queued' más antiguo y lo pasa a 'printing'.

    Antes de reclamar, recupera trabajos trabados. La transacción IMMEDIATE evita
    que dos peticiones del agente reclamen el mismo trabajo (imprimir dos veces).
    """
    recover_stuck()
    with connect() as conn:
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
            ).fetchone()
            if not row:
                conn.execute("COMMIT")
                return None
            ts = _iso(_now())
            conn.execute(
                "UPDATE jobs SET status = 'printing', updated_at = ? WHERE id = ?",
                (ts, row["id"]),
            )
            conn.execute("COMMIT")
            job = dict(row)
            job["status"] = "printing"
            job["updated_at"] = ts
            log.info("agent claimed job id=%s name=%r", job["id"], job["name"])
            return job
        except Exception as exc:  # noqa: BLE001
            conn.execute("ROLLBACK")
            log.error("claim_next failed: %s", exc)
            raise


def set_status(job_id: str, status: str) -> Optional[dict]:
    if status not in STATUSES:
        raise ValueError(f"estado inválido: {status}")
    ts = _iso(_now())
    with connect() as conn:
        cur = conn.execute(
            "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?",
            (status, ts, job_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    log.info("job id=%s -> status=%s", job_id, status)
    return get_job(job_id)


def reprint(job_id: str) -> Optional[dict]:
    """Vuelve el trabajo a 'queued' y lo manda al final (created_at = ahora).

    Sirve tanto para reimprimir un 'printed' como para reencolar un 'printing'
    trabado manualmente desde el panel.
    """
    ts = _iso(_now())
    with connect() as conn:
        cur = conn.execute(
            "UPDATE jobs SET status = 'queued', created_at = ?, updated_at = ? WHERE id = ?",
            (ts, ts, job_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    log.info("job id=%s requeued", job_id)
    return get_job(job_id)


def clear_all_jobs() -> int:
    """Borra todos los trabajos de la cola (para limpiar datos de prueba antes
    del evento). Los PNG en disco los borra el router. Devuelve cuántos había."""
    with connect() as conn:
        n = conn.execute("SELECT COUNT(*) AS n FROM jobs").fetchone()["n"]
        conn.execute("DELETE FROM jobs")
        conn.commit()
    log.warning("cola reseteada: %d trabajo(s) borrado(s)", n)
    return int(n)


def counts() -> dict:
    with connect() as conn:
        rows = conn.execute("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").fetchall()
    by = {r["status"]: int(r["n"]) for r in rows}
    total = sum(by.values())
    return {
        "total": total,
        "printed": by.get("printed", 0),
        "queued": by.get("queued", 0),
        "printing": by.get("printing", 0),
    }


# ---- flags de operación / heartbeat ----

def uploads_paused() -> bool:
    return get_setting(S_UPLOADS_PAUSED, "0") == "1"


def printing_paused() -> bool:
    """Refleja el estado que reporta el AGENTE (él manda su pausa localmente)."""
    return get_setting(S_AGENT_PRINTING_PAUSED, "0") == "1"


def prints_since_cartridge() -> int:
    """Impresiones desde el último cambio de cartucho (reportado por el agente)."""
    try:
        return max(0, int(get_setting(S_PRINTS_SINCE_CARTRIDGE, "0")))
    except (TypeError, ValueError):
        return 0


def set_paused(target: str, paused: bool) -> None:
    """El panel SOLO puede pausar las SUBIDAS de invitados. La pausa de impresión
    la gobierna el agente localmente (ver record_heartbeat); no se comanda remoto."""
    if target != "uploads":
        raise ValueError("solo se puede pausar 'uploads' desde el panel")
    set_setting(S_UPLOADS_PAUSED, "1" if paused else "0")
    log.warning("uploads %s", "PAUSED" if paused else "resumed")


def touch_agent() -> None:
    set_setting(S_AGENT_LAST_SEEN, _iso(_now()))


def record_heartbeat(
    printing_paused: Optional[bool] = None,
    prints_since_cartridge: Optional[int] = None,
) -> None:
    """Guarda el latido del agente y, si los trae, su estado de pausa de impresión
    y el contador de cartucho. Backward-compatible: un heartbeat sin cuerpo solo
    marca 'visto ahora'."""
    touch_agent()
    if printing_paused is not None:
        set_setting(S_AGENT_PRINTING_PAUSED, "1" if printing_paused else "0")
    if prints_since_cartridge is not None:
        set_setting(S_PRINTS_SINCE_CARTRIDGE, str(max(0, int(prints_since_cartridge))))


def agent_status() -> dict:
    raw = get_setting(S_AGENT_LAST_SEEN)
    if not raw:
        return {"last_seen": None, "seconds_ago": None, "alive": False}
    try:
        seen = datetime.fromisoformat(raw)
    except ValueError:
        return {"last_seen": None, "seconds_ago": None, "alive": False}
    ago = (_now() - seen).total_seconds()
    return {"last_seen": raw, "seconds_ago": int(ago), "alive": ago <= AGENT_STALE_S}
