import hashlib
import hmac
import io
import os
import time
from urllib.parse import urlencode
from datetime import date, datetime, time as dtime, timedelta
from zoneinfo import ZoneInfo

import qrcode
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from app import bitacora
from app.db import pool
from app.deps import require_admin, require_session
from app.templating import MESES_ES, templates
from app.tz import hoy_bolivia

router = APIRouter()

VENTANA_TOKEN_SEG = 30
# Si una jornada de un día que ya pasó quedó sin salida (alguien se olvidó de
# marcar), se cuenta como jornada completa de 8 horas en vez de seguir
# sumando horas indefinidamente. No se escribe ninguna marca: si después se
# agrega la salida real, se usa esa.
HORAS_JORNADA_SIN_SALIDA = 8
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


def _dia_param(dia: str | None) -> date:
    try:
        return date.fromisoformat(dia)
    except (TypeError, ValueError):
        return hoy_bolivia()


def _rango(desde: date, hasta: date) -> tuple[datetime, datetime]:
    """[desde, hasta) en hora de Bolivia, para filtrar marcado_en."""
    return (
        datetime.combine(desde, dtime.min, _TZ_BOLIVIA),
        datetime.combine(hasta, dtime.min, _TZ_BOLIVIA),
    )


async def _marcas(desde: date, hasta: date) -> list:
    inicio, fin = _rango(desde, hasta)
    return await pool().fetch(
        "SELECT id, usuario_id, nombre, tipo, marcado_en FROM asistencias "
        "WHERE marcado_en >= $1 AND marcado_en < $2 ORDER BY marcado_en",
        inicio, fin,
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


def _jornadas(filas) -> tuple[list[dict], list[dict]]:
    """Agrupa las marcas (de todos los usuarios) por persona y día, con las
    horas trabajadas de cada jornada cerrada y el total por persona (para el
    resumen que ve el admin). Las jornadas de días anteriores sin salida se
    cuentan como HORAS_JORNADA_SIN_SALIDA (marcadas con `auto`)."""
    hoy = hoy_bolivia().isoformat()
    dias: dict[tuple[int, str], dict] = {}
    for f in filas:
        fecha = f["marcado_en"].astimezone(_TZ_BOLIVIA).date().isoformat()
        clave = (f["usuario_id"], fecha)
        dia = dias.setdefault(
            clave,
            {
                "usuario_id": f["usuario_id"],
                "nombre": f["nombre"],
                "fecha": fecha,
                "entrada": None,
                "entrada_id": None,
                "salida": None,
                "salida_id": None,
                "marcas": 0,
            },
        )
        dia["marcas"] += 1
        if f["tipo"] == "entrada" and dia["entrada"] is None:
            dia["entrada"] = f["marcado_en"]
            dia["entrada_id"] = f["id"]
        elif f["tipo"] == "salida":
            dia["salida"] = f["marcado_en"]
            dia["salida_id"] = f["id"]

    resumen_por_persona: dict[int, dict] = {}
    historial = []
    for dia in dias.values():
        segundos = None
        sin_salida = dia["entrada"] is not None and dia["salida"] is None
        if dia["entrada"] and dia["salida"]:
            segundos = int((dia["salida"] - dia["entrada"]).total_seconds())
        elif sin_salida and dia["fecha"] < hoy:
            segundos = HORAS_JORNADA_SIN_SALIDA * 3600
        dia["segundos"] = segundos
        dia["auto"] = sin_salida and dia["fecha"] < hoy
        dia["abierto"] = sin_salida and dia["fecha"] >= hoy
        historial.append(dia)

        persona = resumen_por_persona.setdefault(
            dia["usuario_id"],
            {"nombre": dia["nombre"], "dias": 0, "dias_cerrados": 0, "segundos_totales": 0, "abierto_desde": None},
        )
        persona["dias"] += 1
        if segundos is not None:
            persona["segundos_totales"] += segundos
            persona["dias_cerrados"] += 1
        elif dia["abierto"]:
            persona["abierto_desde"] = dia["entrada"]

    historial.sort(key=lambda d: (d["fecha"], d["nombre"]), reverse=True)
    personas = sorted(resumen_por_persona.values(), key=lambda p: p["nombre"])
    return historial, personas


def _calendario(inicio_mes: date, fin_mes: date, jornadas: list[dict]) -> list[list[dict | None]]:
    """Semanas (lunes a domingo) del mes; cada día con sus jornadas en orden
    de llegada. Los huecos antes del día 1 y después del último son None."""
    por_dia: dict[str, list[dict]] = {}
    for j in jornadas:
        por_dia.setdefault(j["fecha"], []).append(j)
    semanas: list[list[dict | None]] = []
    semana: list[dict | None] = [None] * inicio_mes.weekday()
    d = inicio_mes
    while d < fin_mes:
        lista = sorted(por_dia.get(d.isoformat(), []), key=lambda j: (j["entrada"] is None, j["entrada"] or 0, j["nombre"]))
        semana.append({"fecha": d.isoformat(), "numero": d.day, "jornadas": lista})
        if len(semana) == 7:
            semanas.append(semana)
            semana = []
        d += timedelta(days=1)
    if semana:
        semanas.append(semana + [None] * (7 - len(semana)))
    return semanas


async def _contexto_dia(dia: date) -> dict:
    hoy = hoy_bolivia()
    marcas = await _marcas(dia, dia + timedelta(days=1))
    return {
        "marcadas": list(reversed(marcas)),
        "dia": dia.isoformat(),
        "dia_nombre": f"{dia:%d/%m/%Y}",
        "es_hoy": dia == hoy,
        "dia_anterior": (dia - timedelta(days=1)).isoformat(),
        "dia_siguiente": (dia + timedelta(days=1)).isoformat(),
        "hoy": hoy.isoformat(),
    }


@router.get("/dashboard/asistencia", response_class=HTMLResponse)
async def asistencia_page(
    request: Request, session: dict = Depends(require_admin), dia: str | None = None, error: str | None = None
):
    dia_date = _dia_param(dia)
    ctx = await _contexto_dia(dia_date)
    jornadas_dia, _ = _jornadas(ctx["marcadas"][::-1])
    inicio_mes = dia_date.replace(day=1)
    fin_mes = (inicio_mes + timedelta(days=32)).replace(day=1)
    marcas_mes = await _marcas(inicio_mes, fin_mes)
    jornadas_mes, _ = _jornadas(marcas_mes)
    usuarios = await pool().fetch("SELECT id, nombre FROM usuarios WHERE nombre IS NOT NULL AND nombre <> '' ORDER BY nombre")
    ctx.update({
        "session": session,
        "active": "asistencia",
        "jornadas_dia": sorted(jornadas_dia, key=lambda j: j["nombre"]),
        "calendario": _calendario(inicio_mes, fin_mes, jornadas_mes),
        "mes_anterior": (inicio_mes - timedelta(days=1)).replace(day=1).isoformat(),
        "mes_siguiente": fin_mes.isoformat() if fin_mes <= hoy_bolivia() else None,
        "marcas_mes": list(reversed(marcas_mes)),
        "mes_nombre": f"{MESES_ES[inicio_mes.month - 1].capitalize()} {inicio_mes.year}",
        "usuarios": usuarios,
        "error": error,
    })
    return templates.TemplateResponse(request, "dashboard/asistencia.html", ctx)


@router.get("/dashboard/mi-asistencia", response_class=HTMLResponse)
async def mi_asistencia_page(request: Request, session: dict = Depends(require_session)):
    """Versión web, optimizada para celular, de la asistencia por QR — pensada
    para quienes no tienen Android (y por lo tanto no pueden usar la app
    nativa): escanean con la cámara del navegador y usan las mismas APIs
    (/api/asistencia/mias y /api/asistencia/marcar) que ya usa la app."""
    return templates.TemplateResponse(
        request, "dashboard/mi_asistencia.html", {"session": session, "active": "mi_asistencia"}
    )


@router.get("/dashboard/asistencia/feed", response_class=HTMLResponse)
async def asistencia_feed(request: Request, session: dict = Depends(require_admin), dia: str | None = None):
    ctx = await _contexto_dia(_dia_param(dia))
    return templates.TemplateResponse(request, "partials/_asistencia_feed.html", ctx)


@router.post("/dashboard/asistencia/{asistencia_id}/eliminar")
async def eliminar_asistencia(asistencia_id: int, session: dict = Depends(require_admin), volver: str = Form("")):
    fila = await pool().fetchrow(
        "SELECT nombre, tipo, marcado_en FROM asistencias WHERE id = $1", asistencia_id
    )
    if fila:
        await pool().execute("DELETE FROM asistencias WHERE id = $1", asistencia_id)
        await bitacora.registrar(
            session,
            "Eliminó marca de asistencia",
            f"{fila['nombre']} — {fila['tipo']} del {fila['marcado_en'].astimezone(_TZ_BOLIVIA).strftime('%d/%m/%Y %H:%M')}",
        )
    # Vuelve al día que se estaba viendo, no al de la marca borrada.
    return RedirectResponse(f"/dashboard/asistencia?dia={_dia_param(volver).isoformat()}", status_code=303)


@router.post("/dashboard/asistencia/manual")
async def agregar_asistencia_manual(
    session: dict = Depends(require_admin),
    usuario_id: str = Form(""),
    tipo: str = Form(""),
    fecha: str = Form(""),
    hora: str = Form(""),
):
    """El admin carga a mano una marca que faltó (alguien se olvidó de
    escanear el QR), con la fecha y hora reales en que entró o salió."""
    try:
        marcado_en = datetime.combine(date.fromisoformat(fecha), dtime.fromisoformat(hora), _TZ_BOLIVIA)
        uid = int(usuario_id)
    except ValueError:
        return RedirectResponse(
            "/dashboard/asistencia?" + urlencode({"dia": fecha, "error": "Completa persona, tipo, fecha y hora."}), status_code=303
        )
    usuario = await pool().fetchrow("SELECT id, username, nombre FROM usuarios WHERE id = $1", uid)
    if usuario is None or tipo not in ("entrada", "salida"):
        return RedirectResponse(
            "/dashboard/asistencia?" + urlencode({"dia": fecha, "error": "Completa persona, tipo, fecha y hora."}), status_code=303
        )
    await pool().execute(
        "INSERT INTO asistencias (usuario_id, username, nombre, tipo, marcado_en) VALUES ($1, $2, $3, $4, $5)",
        usuario["id"], usuario["username"], usuario["nombre"], tipo, marcado_en,
    )
    await bitacora.registrar(
        session, "Agregó marca de asistencia a mano", f"{usuario['nombre']} — {tipo} del {marcado_en:%d/%m/%Y %H:%M}"
    )
    return RedirectResponse(f"/dashboard/asistencia?dia={fecha}", status_code=303)


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
