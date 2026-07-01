"""Verificación de tokens Bearer para agente y panel."""
import hmac
import re

from fastapi import Header, HTTPException

from .config import PANEL_PASSWORD, PRINTER_KEY

_BEARER_RE = re.compile(r"bearer\s+(.+)", re.IGNORECASE)


def _extract_bearer(authorization: str | None) -> str:
    m = _BEARER_RE.match(authorization or "")
    if not m:
        raise HTTPException(status_code=401, detail="Falta el token Bearer")
    return m.group(1).strip()


def _check(token: str, expected: str) -> None:
    # Comparación en tiempo constante; rechaza si el secreto no está configurado.
    if not expected or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=403, detail="No autorizado")


def require_printer_key(authorization: str | None = Header(default=None)) -> None:
    """Dependencia para endpoints del agente de impresión (PRINTER_KEY)."""
    _check(_extract_bearer(authorization), PRINTER_KEY)


def require_panel_password(authorization: str | None = Header(default=None)) -> None:
    """Dependencia para endpoints del panel (PANEL_PASSWORD)."""
    _check(_extract_bearer(authorization), PANEL_PASSWORD)
