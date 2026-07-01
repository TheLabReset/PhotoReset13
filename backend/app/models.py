"""Operaciones sobre la cola de trabajos (Job)."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from .db import connect

# Estados válidos de un trabajo.
STATUSES = {"queued", "printing", "printed", "skipped", "failed"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_job(name: str) -> dict:
    job_id = uuid.uuid4().hex
    ts = _now()
    with connect() as conn:
        conn.execute(
            "INSERT INTO jobs (id, name, status, created_at, updated_at) "
            "VALUES (?, ?, 'queued', ?, ?)",
            (job_id, name, ts, ts),
        )
        conn.commit()
    return {"id": job_id, "name": name, "status": "queued", "created_at": ts, "updated_at": ts}


def get_job(job_id: str) -> Optional[dict]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def position_of(job_id: str) -> int:
    """1-indexado: cuántos trabajos en cola hay antes o igual que este."""
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


def claim_next() -> Optional[dict]:
    """Toma atómicamente el trabajo 'queued' más antiguo y lo pasa a 'printing'.

    La transacción IMMEDIATE evita que dos peticiones del agente reclamen el
    mismo trabajo y lo impriman dos veces.
    """
    with connect() as conn:
        try:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
            ).fetchone()
            if not row:
                conn.execute("COMMIT")
                return None
            ts = _now()
            conn.execute(
                "UPDATE jobs SET status = 'printing', updated_at = ? WHERE id = ?",
                (ts, row["id"]),
            )
            conn.execute("COMMIT")
            job = dict(row)
            job["status"] = "printing"
            job["updated_at"] = ts
            return job
        except Exception:
            conn.execute("ROLLBACK")
            raise


def set_status(job_id: str, status: str) -> Optional[dict]:
    if status not in STATUSES:
        raise ValueError(f"estado inválido: {status}")
    ts = _now()
    with connect() as conn:
        cur = conn.execute(
            "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?",
            (status, ts, job_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    return get_job(job_id)


def reprint(job_id: str) -> Optional[dict]:
    """Vuelve el trabajo a 'queued' y lo manda al final (created_at = ahora)."""
    ts = _now()
    with connect() as conn:
        cur = conn.execute(
            "UPDATE jobs SET status = 'queued', created_at = ?, updated_at = ? WHERE id = ?",
            (ts, ts, job_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
    return get_job(job_id)


def counts() -> dict:
    with connect() as conn:
        rows = conn.execute("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").fetchall()
    by = {r["status"]: int(r["n"]) for r in rows}
    total = sum(by.values())
    return {
        "total": total,
        "printed": by.get("printed", 0),
        "queued": by.get("queued", 0) + by.get("printing", 0),
    }
