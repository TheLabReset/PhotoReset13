"""Logging claro para diagnosticar en vivo durante el evento."""
import logging
import sys

_configured = False


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s", "%H:%M:%S")
    )
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers = [handler]
    _configured = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
