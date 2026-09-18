from fastapi import Request

from app.session import COOKIE_NAME, decode_session


class RedirectTo(Exception):
    def __init__(self, path: str):
        self.path = path


def get_session(request: Request) -> dict | None:
    value = request.cookies.get(COOKIE_NAME)
    if not value:
        return None
    return decode_session(value)


def require_session(request: Request) -> dict:
    session = get_session(request)
    if session is None:
        raise RedirectTo("/")
    return session


def require_dashboard(request: Request) -> dict:
    session = require_session(request)
    if session["role"] == "cajero":
        raise RedirectTo("/dashboard/ventas")
    return session


def require_admin(request: Request) -> dict:
    session = require_session(request)
    if session.get("role") != "admin":
        raise RedirectTo("/dashboard/ventas" if session["role"] == "cajero" else "/dashboard")
    return session
