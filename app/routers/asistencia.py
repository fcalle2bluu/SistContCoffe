import hashlib
import hmac
import io
import os
import time

import qrcode
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response

from app.db import pool
from app.deps import require_admin, require_session
from app.templating import templates

router = APIRouter()

VENTANA_TOKEN_SEG = 30


def _secret() -> bytes:
    return os.environ["SESSION_SECRET"].encode()


def _generar_token() -> str:
    ts = str(int(time.time()))
    firma = hmac.new(_secret(), ts.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{ts}.{firma}"


def _token_valido(token: str) -> bool:
    try:
        ts_str, firma = token.split(".", 1)
    except ValueError:
        return False
    esperado = hmac.new(_secret(), ts_str.encode(), hashlib.sha256).hexdigest()[:16]
    if not hmac.compare_digest(firma, esperado):
        return False
    try:
        ts = int(ts_str)
    except ValueError:
        return False
    return abs(time.time() - ts) <= VENTANA_TOKEN_SEG


async def _asistencias_hoy() -> list:
    return await pool().fetch(
        "SELECT nombre, marcado_en FROM asistencias "
        "WHERE marcado_en >= date_trunc('day', now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz' "
        "ORDER BY marcado_en DESC"
    )


@router.get("/dashboard/asistencia", response_class=HTMLResponse)
async def asistencia_page(request: Request, session: dict = Depends(require_admin)):
    marcadas = await _asistencias_hoy()
    return templates.TemplateResponse(
        request, "dashboard/asistencia.html", {"session": session, "active": "asistencia", "marcadas": marcadas}
    )


@router.get("/dashboard/asistencia/feed", response_class=HTMLResponse)
async def asistencia_feed(request: Request, session: dict = Depends(require_admin)):
    marcadas = await _asistencias_hoy()
    return templates.TemplateResponse(request, "partials/_asistencia_feed.html", {"marcadas": marcadas})


@router.get("/dashboard/asistencia/qr.png")
async def asistencia_qr(request: Request, session: dict = Depends(require_admin)):
    token = _generar_token()
    url = f"{request.base_url}api/asistencia/marcar?token={token}"
    img = qrcode.make(url, box_size=10, border=2)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/api/asistencia/mias")
async def mis_asistencias(session: dict = Depends(require_session)):
    total = await pool().fetchval("SELECT COUNT(*) FROM asistencias WHERE usuario_id = $1", session["id"])
    ya_hoy = await pool().fetchval(
        "SELECT 1 FROM asistencias WHERE usuario_id = $1 "
        "AND marcado_en >= date_trunc('day', now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz'",
        session["id"],
    )
    ultimas = await pool().fetch(
        "SELECT marcado_en FROM asistencias WHERE usuario_id = $1 ORDER BY marcado_en DESC LIMIT 10",
        session["id"],
    )
    return JSONResponse({
        "total": total,
        "ya_hoy": bool(ya_hoy),
        "ultimas": [r["marcado_en"].isoformat() for r in ultimas],
    })


@router.post("/api/asistencia/marcar")
async def marcar_asistencia(token: str, session: dict = Depends(require_session)):
    if not _token_valido(token):
        return JSONResponse({"ok": False, "error": "El código ya expiró. Pedile al encargado que lo actualice."}, status_code=400)

    ya_hoy = await pool().fetchval(
        "SELECT 1 FROM asistencias WHERE usuario_id = $1 "
        "AND marcado_en >= date_trunc('day', now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz'",
        session["id"],
    )
    if ya_hoy:
        return JSONResponse({"ok": False, "error": f"{session['nombre']} ya registró asistencia hoy."}, status_code=409)

    fila = await pool().fetchrow(
        "INSERT INTO asistencias (usuario_id, username, nombre) VALUES ($1, $2, $3) RETURNING marcado_en",
        session["id"], session["username"], session["nombre"],
    )
    return JSONResponse({"ok": True, "nombre": session["nombre"], "hora": fila["marcado_en"].isoformat()})
