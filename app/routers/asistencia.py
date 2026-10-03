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


def _token_fijo() -> str:
    """Token del QR de asistencia IMPRESO: siempre el mismo (no vence), para
    poder imprimirlo y pegarlo en el local. Igual hace falta iniciar sesión
    con la cuenta propia para marcar."""
    firma = hmac.new(_secret(), b"asistencia-qr-fijo", hashlib.sha256).hexdigest()[:16]
    return f"fijo.{firma}"


def _token_valido(token: str) -> bool:
    try:
        ts_str, firma = token.split(".", 1)
    except ValueError:
        return False
    if ts_str == "fijo":
        return hmac.compare_digest(token, _token_fijo())
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


async def _horarios_por_usuario() -> dict[int, dict[int, tuple[dtime, dtime]]]:
    """Horario asignado a cada persona por día de la semana (0=lunes ...
    6=domingo). Si una persona no tiene fila para un día, ese día no le
    toca venir (franco) y no cuenta como falta."""
    filas = await pool().fetch("SELECT usuario_id, dia_semana, hora_inicio, hora_fin FROM horarios_personal")
    resultado: dict[int, dict[int, tuple[dtime, dtime]]] = {}
    for f in filas:
        resultado.setdefault(f["usuario_id"], {})[f["dia_semana"]] = (f["hora_inicio"], f["hora_fin"])
    return resultado


def _horas_esperadas(hora_inicio: dtime, hora_fin: dtime) -> float:
    inicio = datetime.combine(date(2000, 1, 1), hora_inicio)
    fin = datetime.combine(date(2000, 1, 1), hora_fin)
    return round((fin - inicio).total_seconds() / 3600, 2)


def _cuadricula_asistencia(
    jornadas_mes: list[dict], usuarios: list, horarios: dict[int, dict[int, tuple]], inicio_mes: date,
    fin_mes: date, hoy: date,
) -> list[dict]:
    """Cuadrícula del mes: una fila por persona, una celda por día,
    comparando el horario que le tocaba contra lo que marcó. Reemplaza al
    gráfico de barras de atrasos/excesos — con un atraso mucho más grande
    que el resto, la escala compartida dejaba casi invisibles las
    diferencias chicas; acá cada día se mira aparte, sin escala que
    aplastar nada. Estado de cada celda:
    - "libre": no le tocaba venir ese día de la semana.
    - "futuro": el día todavía no pasó (incluye hoy, si todavía no marcó).
    - "ausente": le tocaba venir, el día ya pasó y no marcó entrada.
    - "a_tiempo" / "atraso" / "exceso" / "atraso_exceso": marcó, comparado
      contra lo que le tocaba (atraso = entró tarde; exceso = trabajó de
      más, solo una vez cerrada la jornada).
    - "en_curso": hoy, todavía con la jornada abierta.
    - "sin_horario": la persona no tiene horario cargado — se muestra lo
      que marcó ese día, sin poder juzgarlo contra nada."""
    por_usuario_dia = {(j["usuario_id"], j["fecha"]): j for j in jornadas_mes}
    dias_mes = []
    d = inicio_mes
    while d < fin_mes:
        dias_mes.append(d)
        d += timedelta(days=1)

    filas = []
    for u in usuarios:
        horario_usuario = horarios.get(u["id"])
        celdas = []
        for dia in dias_mes:
            celda = {"numero": dia.day, "es_hoy": dia == hoy}
            rango = horario_usuario.get(dia.weekday()) if horario_usuario else None

            if horario_usuario is None:
                celda["estado"] = "sin_horario"
                jornada = por_usuario_dia.get((u["id"], dia.isoformat()))
                if jornada is not None and jornada["entrada"] is not None:
                    celda["entrada"] = f'{jornada["entrada"].astimezone(_TZ_BOLIVIA):%H:%M}'
                    if jornada["salida"] is not None:
                        celda["salida"] = f'{jornada["salida"].astimezone(_TZ_BOLIVIA):%H:%M}'
                    celda["detalle"] = f'Marcó {celda["entrada"]} — sin horario asignado para comparar.'
                else:
                    celda["detalle"] = "Sin horario asignado."
            elif not rango:
                celda["estado"] = "libre"
                celda["detalle"] = "Día libre."
            elif dia >= hoy:
                celda["estado"] = "futuro"
                hora_inicio_esperada, hora_fin_esperada = rango
                celda["esperado"] = f"{hora_inicio_esperada:%H:%M}–{hora_fin_esperada:%H:%M}"
                celda["detalle"] = f'Le toca {celda["esperado"]}.' if dia > hoy else f'Hoy le toca {celda["esperado"]} — todavía no marca entrada.'
            else:
                hora_inicio_esperada, hora_fin_esperada = rango
                celda["esperado"] = f"{hora_inicio_esperada:%H:%M}–{hora_fin_esperada:%H:%M}"
                jornada = por_usuario_dia.get((u["id"], dia.isoformat()))
                if jornada is None or jornada["entrada"] is None:
                    celda["estado"] = "ausente"
                    celda["detalle"] = f'No marcó entrada — le tocaba {celda["esperado"]}.'
                else:
                    entrada_local = jornada["entrada"].astimezone(_TZ_BOLIVIA)
                    celda["entrada"] = f"{entrada_local:%H:%M}"
                    atraso_min = 0
                    if entrada_local.time() > hora_inicio_esperada:
                        esperada_dt = datetime.combine(date(2000, 1, 1), hora_inicio_esperada)
                        real_dt = datetime.combine(date(2000, 1, 1), entrada_local.time())
                        atraso_min = round((real_dt - esperada_dt).total_seconds() / 60)
                    exceso_min = 0
                    if jornada["salida"] is not None:
                        celda["salida"] = f'{jornada["salida"].astimezone(_TZ_BOLIVIA):%H:%M}'
                    if jornada["segundos"] is not None:
                        esperado_h = _horas_esperadas(hora_inicio_esperada, hora_fin_esperada)
                        trabajado_h = jornada["segundos"] / 3600
                        if trabajado_h > esperado_h:
                            exceso_min = round((trabajado_h - esperado_h) * 60)
                    celda["atraso_min"] = atraso_min
                    celda["exceso_min"] = exceso_min
                    partes = [f'Entró {celda["entrada"]} (le tocaba {celda["esperado"]})']
                    if atraso_min > 0 and exceso_min > 0:
                        celda["estado"] = "atraso_exceso"
                        partes.append(f"{atraso_min} min tarde, {exceso_min} min de más")
                    elif atraso_min > 0:
                        celda["estado"] = "atraso"
                        partes.append(f"{atraso_min} min tarde")
                    elif exceso_min > 0:
                        celda["estado"] = "exceso"
                        partes.append(f"{exceso_min} min de más")
                    elif jornada["abierto"]:
                        celda["estado"] = "en_curso"
                        partes.append("turno en curso")
                    else:
                        celda["estado"] = "a_tiempo"
                        partes.append("a tiempo")
                    celda["detalle"] = " — ".join(partes) + "."
            celdas.append(celda)
        filas.append({"usuario_id": u["id"], "nombre": u["nombre"], "celdas": celdas})
    return filas


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
    # Para la cuadrícula de asistencia: personal de mostrador real, sin la
    # cuenta genérica compartida "Cajero de Turno" (username "cajero") ni
    # las cuentas de administración, que no marcan asistencia.
    usuarios_cuadricula = await pool().fetch(
        "SELECT id, nombre FROM usuarios WHERE role = 'cajero' AND username <> 'cajero' "
        "AND nombre IS NOT NULL AND nombre <> '' ORDER BY nombre"
    )
    horarios = await _horarios_por_usuario()
    dias_mes_cab = []
    d = inicio_mes
    while d < fin_mes:
        dias_mes_cab.append({"numero": d.day, "letra": "LMXJVSD"[d.weekday()], "es_hoy": d == hoy_bolivia()})
        d += timedelta(days=1)
    ctx.update({
        "session": session,
        "active": "asistencia",
        "jornadas_dia": sorted(jornadas_dia, key=lambda j: j["nombre"]),
        "cuadricula_asistencia": _cuadricula_asistencia(
            jornadas_mes, usuarios_cuadricula, horarios, inicio_mes, fin_mes, hoy_bolivia()
        ),
        "dias_mes_cab": dias_mes_cab,
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


def _url_qr(request: Request) -> str:
    return f"{request.base_url}api/asistencia/marcar?token={_token_fijo()}"


@router.get("/dashboard/asistencia/qr.png")
async def asistencia_qr(request: Request, session: dict = Depends(require_admin)):
    img = qrcode.make(_url_qr(request), box_size=10, border=2)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return Response(content=buffer.getvalue(), media_type="image/png")


@router.get("/dashboard/asistencia/qr-imprimir.png")
async def asistencia_qr_imprimir(request: Request, session: dict = Depends(require_admin)):
    """El mismo QR fijo, en grande y con título, listo para imprimir."""
    from PIL import Image, ImageDraw, ImageFont

    qr = qrcode.make(_url_qr(request), box_size=24, border=2).convert("RGB")
    ancho = qr.width + 160
    lienzo = Image.new("RGB", (ancho, qr.height + 420), "white")
    dibujo = ImageDraw.Draw(lienzo)

    def fuente(tamano):
        # Vera viene con reportlab (ya instalado) y tiene acentos; la letra
        # por defecto de Pillow no muestra la "é" de "Café".
        import reportlab
        ruta = os.path.join(os.path.dirname(reportlab.__file__), "fonts", "VeraBd.ttf")
        try:
            return ImageFont.truetype(ruta, tamano)
        except OSError:
            return ImageFont.load_default()

    def centrado(y, texto, tamano):
        f = fuente(tamano)
        w = dibujo.textlength(texto, font=f)
        dibujo.text(((ancho - w) / 2, y), texto, fill="black", font=f)

    centrado(50, "Café Yanaloma", 64)
    centrado(140, "ASISTENCIA", 84)
    lienzo.paste(qr, (80, 260))
    centrado(qr.height + 290, "Escanea con la app o en Mi Asistencia", 40)
    centrado(qr.height + 345, "para marcar tu entrada y tu salida", 40)
    buffer = io.BytesIO()
    lienzo.save(buffer, format="PNG", dpi=(300, 300))
    await bitacora.registrar(session, "Descargó QR de asistencia para imprimir", "")
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="QR-Asistencia-Yanaloma.png"'},
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
