import hashlib
import hmac
import io
import os
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import qrcode
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response

from app.db import pool
from app.deps import require_admin, require_session
from app.templating import templates

router = APIRouter()

VENTANA_TOKEN_SEG = 30
_TZ_BOLIVIA = ZoneInfo("America/La_Paz")


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
        "SELECT nombre, tipo, marcado_en FROM asistencias "
        "WHERE marcado_en >= date_trunc('day', now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz' "
        "ORDER BY marcado_en DESC"
    )


def _agrupar_historial(filas: list) -> tuple[list[dict], float]:
    """Empareja entradas y salidas por día (hora de Bolivia) y suma las horas trabajadas."""
    dias: dict[str, dict] = {}
    for f in filas:
        fecha = f["marcado_en"].astimezone(_TZ_BOLIVIA).date().isoformat()
        dia = dias.setdefault(fecha, {"fecha": fecha, "entrada": None, "salida": None})
        if f["tipo"] == "entrada" and dia["entrada"] is None:
            dia["entrada"] = f["marcado_en"].isoformat()
        elif f["tipo"] == "salida":
            dia["salida"] = f["marcado_en"].isoformat()

    horas_totales = 0.0
    resultado = []
    for dia in dias.values():
        horas = None
        if dia["entrada"] and dia["salida"]:
            entrada_dt = datetime.fromisoformat(dia["entrada"])
            salida_dt = datetime.fromisoformat(dia["salida"])
            horas = round((salida_dt - entrada_dt).total_seconds() / 3600, 2)
            horas_totales += horas
        dia["horas"] = horas
        resultado.append(dia)
    resultado.sort(key=lambda d: d["fecha"], reverse=True)
    return resultado, round(horas_totales, 2)


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
    filas = await pool().fetch(
        "SELECT tipo, marcado_en FROM asistencias WHERE usuario_id = $1 ORDER BY marcado_en",
        session["id"],
    )
    dias, horas_totales = _agrupar_historial(filas)
    return JSONResponse({"horas_totales": horas_totales, "dias": dias})


@router.post("/api/asistencia/marcar")
async def marcar_asistencia(token: str, session: dict = Depends(require_session)):
    if not _token_valido(token):
        return JSONResponse({"ok": False, "error": "El código ya expiró. Pedile al encargado que lo actualice."}, status_code=400)

    hoy = await pool().fetch(
        "SELECT tipo FROM asistencias WHERE usuario_id = $1 "
        "AND marcado_en >= date_trunc('day', now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz' "
        "ORDER BY marcado_en",
        session["id"],
    )
    tipos_hoy = {r["tipo"] for r in hoy}
    if "entrada" not in tipos_hoy:
        tipo = "entrada"
    elif "salida" not in tipos_hoy:
        tipo = "salida"
    else:
        return JSONResponse(
            {"ok": False, "error": f"{session['nombre']} ya registró entrada y salida hoy."}, status_code=409
        )

    fila = await pool().fetchrow(
        "INSERT INTO asistencias (usuario_id, username, nombre, tipo) VALUES ($1, $2, $3, $4) RETURNING marcado_en",
        session["id"], session["username"], session["nombre"], tipo,
    )
    return JSONResponse({"ok": True, "nombre": session["nombre"], "tipo": tipo, "hora": fila["marcado_en"].isoformat()})
