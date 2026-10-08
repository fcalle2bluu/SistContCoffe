from datetime import date, timedelta

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_session
from app.templating import MESES_ES, templates
from app.tz import hoy_bolivia

router = APIRouter(prefix="/dashboard/insumos")

SELECT_INSUMOS = (
    "SELECT id, fecha, detalle, cantidad, medida, respaldo, precio_unitario, total, solicitante, responsable "
    "FROM compras_insumos ORDER BY fecha DESC, id DESC"
)


async def _solicitantes():
    return await pool().fetch(
        """
        SELECT nombre FROM solicitantes_referencia
        UNION
        SELECT nombre FROM usuarios WHERE nombre IS NOT NULL AND nombre <> ''
        ORDER BY nombre
        """
    )


async def _listas_referencia():
    medidas = await pool().fetch("SELECT id, nombre FROM medidas_referencia ORDER BY nombre")
    solicitantes = await _solicitantes()
    return medidas, solicitantes


@router.get("", response_class=HTMLResponse)
async def insumos_page(request: Request, session: dict = Depends(require_session), error: str | None = None):
    insumos = await pool().fetch(SELECT_INSUMOS)
    total_general = sum(float(i["total"]) for i in insumos)
    medidas, solicitantes = await _listas_referencia()
    return templates.TemplateResponse(
        request,
        "dashboard/insumos.html",
        {
            "session": session,
            "active": "insumos",
            "insumos": insumos,
            "total_general": total_general,
            "medidas": medidas,
            "solicitantes": solicitantes,
            "medida_seleccionada": None,
            "solicitante_seleccionado": None,
            "error": error,
        },
    )


@router.post("/medidas", response_class=HTMLResponse)
async def agregar_medida(request: Request, session: dict = Depends(require_session), nombre_nueva: str = Form("")):
    nombre_nueva = nombre_nueva.strip().upper()
    if nombre_nueva:
        await pool().execute(
            "INSERT INTO medidas_referencia (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING", nombre_nueva
        )
    medidas = await pool().fetch("SELECT id, nombre FROM medidas_referencia ORDER BY nombre")
    return templates.TemplateResponse(
        request, "partials/_medida_select.html", {"medidas": medidas, "medida_seleccionada": nombre_nueva}
    )


@router.post("/solicitantes", response_class=HTMLResponse)
async def agregar_solicitante(
    request: Request, session: dict = Depends(require_session), nombre_nueva: str = Form("")
):
    nombre_nueva = nombre_nueva.strip()
    if nombre_nueva:
        await pool().execute(
            "INSERT INTO solicitantes_referencia (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING", nombre_nueva
        )
    solicitantes = await _solicitantes()
    return templates.TemplateResponse(
        request,
        "partials/_solicitante_select.html",
        {"solicitantes": solicitantes, "solicitante_seleccionado": nombre_nueva},
    )


@router.post("", response_class=HTMLResponse)
async def crear_compra_insumo(
    request: Request,
    session: dict = Depends(require_session),
    fecha: str = Form(""),
    detalle: str = Form(""),
    cantidad: str = Form(""),
    medida: str = Form(""),
    respaldo: str = Form(""),
    precio_unitario: str = Form(""),
    solicitante: str = Form(""),
):
    detalle = detalle.strip()
    error = None
    try:
        cantidad_num = float(cantidad)
        precio_num = float(precio_unitario)
    except ValueError:
        cantidad_num = precio_num = None

    if not fecha or not detalle or cantidad_num is None or precio_num is None:
        error = "Completa fecha, detalle, cantidad y precio unitario."

    if error:
        insumos = await pool().fetch(SELECT_INSUMOS)
        total_general = sum(float(i["total"]) for i in insumos)
        medidas, solicitantes = await _listas_referencia()
        return templates.TemplateResponse(
            request,
            "dashboard/insumos.html",
            {
                "session": session,
                "active": "insumos",
                "insumos": insumos,
                "total_general": total_general,
                "medidas": medidas,
                "solicitantes": solicitantes,
                "medida_seleccionada": medida.strip() or None,
                "solicitante_seleccionado": solicitante.strip() or None,
                "error": error,
            },
            status_code=400,
        )

    await pool().execute(
        """
        INSERT INTO compras_insumos (fecha, detalle, cantidad, medida, respaldo, precio_unitario, solicitante, responsable)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        date.fromisoformat(fecha),
        detalle,
        cantidad_num,
        medida.strip() or None,
        respaldo.strip() or None,
        precio_num,
        solicitante.strip() or None,
        session["nombre"],
    )
    await bitacora.registrar(session, "Registró compra de insumo", f"{detalle} — Bs {cantidad_num * precio_num:.2f}")
    return RedirectResponse("/dashboard/insumos", status_code=303)


@router.post("/{insumo_id}/eliminar")
async def eliminar_compra_insumo(insumo_id: int, session: dict = Depends(require_session)):
    await pool().execute("DELETE FROM compras_insumos WHERE id = $1", insumo_id)
    await bitacora.registrar(session, "Eliminó compra de insumo", f"Insumo #{insumo_id}")
    return RedirectResponse("/dashboard/insumos", status_code=303)


# --- API para la app móvil (pestaña Insumos, todos los usuarios) -----------

router_api = APIRouter(prefix="/api/insumos")


def _mes_api(mes: str | None) -> tuple[date, date]:
    hoy = hoy_bolivia()
    try:
        anio, m = (int(x) for x in (mes or "").split("-"))
        inicio = date(anio, m, 1)
    except ValueError:
        inicio = hoy.replace(day=1)
    fin = (inicio.replace(day=28) + timedelta(days=4)).replace(day=1)
    return inicio, fin


def _compra_json(c, session: dict, nro: int) -> dict:
    inicial = float(c["cantidad"])
    final = float(c["cantidad_final"]) if c["cantidad_final"] is not None else None
    return {
        "id": c["id"],
        # N° de ítem dentro del mes (1 = la primera compra del mes).
        "nro": nro,
        "fecha": c["fecha"].isoformat(),
        "detalle": c["detalle"],
        "cantidad": inicial,
        # Lo que queda; el uso sale solo (inicial − final). None = todavía no se anotó.
        "cantidad_final": final,
        "uso": round(inicial - final, 3) if final is not None else None,
        "medida": c["medida"],
        "precio_unitario": round(float(c["precio_unitario"]), 2),
        "total": round(float(c["total"]), 2),
        "respaldo": c["respaldo"],
        "solicitante": c["solicitante"],
        "responsable": c["responsable"],
        # Cada uno puede borrar lo que cargó; el admin, cualquier compra.
        "puede_eliminar": session.get("role") == "admin" or c["responsable"] == session.get("nombre"),
    }


@router_api.get("")
async def insumos_api(session: dict = Depends(require_session), mes: str | None = None):
    inicio, fin = _mes_api(mes)
    compras = await pool().fetch(
        "SELECT id, fecha, detalle, cantidad, cantidad_final, medida, respaldo, precio_unitario, total, "
        "solicitante, responsable FROM compras_insumos WHERE fecha >= $1 AND fecha < $2 ORDER BY fecha DESC, id DESC",
        inicio, fin,
    )
    medidas, solicitantes = await _listas_referencia()
    detalles = await pool().fetch(
        "SELECT detalle, MAX(fecha) AS ultima FROM compras_insumos GROUP BY detalle ORDER BY ultima DESC LIMIT 60"
    )
    hoy = hoy_bolivia()
    return JSONResponse({
        "mes": f"{inicio:%Y-%m}",
        "mes_nombre": f"{MESES_ES[inicio.month - 1].capitalize()} {inicio.year}",
        "mes_anterior": f"{(inicio - timedelta(days=1)):%Y-%m}",
        "mes_siguiente": f"{fin:%Y-%m}" if fin <= hoy else None,
        "hoy": hoy.isoformat(),
        "total": round(sum(float(c["total"]) for c in compras), 2),
        "compras": [_compra_json(c, session, len(compras) - i) for i, c in enumerate(compras)],
        "medidas": [m["nombre"] for m in medidas],
        "solicitantes": [s["nombre"] for s in solicitantes],
        "detalles_frecuentes": [d["detalle"] for d in detalles],
    })


@router_api.post("")
async def crear_insumo_api(
    session: dict = Depends(require_session),
    fecha: str = Form(""),
    detalle: str = Form(""),
    cantidad: str = Form(""),
    medida: str = Form(""),
    respaldo: str = Form(""),
    precio_unitario: str = Form(""),
    solicitante: str = Form(""),
):
    detalle = detalle.strip()
    try:
        cantidad_num = float(cantidad.replace(",", "."))
        precio_num = float(precio_unitario.replace(",", "."))
        fecha_d = date.fromisoformat(fecha)
    except ValueError:
        return JSONResponse({"ok": False, "error": "Revisa la fecha, la cantidad y el precio."}, status_code=400)
    if not detalle or cantidad_num <= 0 or precio_num < 0:
        return JSONResponse(
            {"ok": False, "error": "Completa qué compraste, una cantidad mayor a 0 y el precio."}, status_code=400
        )
    if fecha_d > hoy_bolivia():
        return JSONResponse({"ok": False, "error": "La fecha no puede ser futura."}, status_code=400)
    nuevo_id = await pool().fetchval(
        """
        INSERT INTO compras_insumos (fecha, detalle, cantidad, medida, respaldo, precio_unitario, solicitante, responsable)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
        """,
        fecha_d, detalle, cantidad_num, medida.strip() or None, respaldo.strip() or None, precio_num,
        solicitante.strip() or None, session["nombre"],
    )
    await bitacora.registrar(
        session, "Registró compra de insumo", f"{detalle} — Bs {cantidad_num * precio_num:.2f} (desde la app)"
    )
    return JSONResponse({"ok": True, "id": nuevo_id})


@router_api.post("/{insumo_id}/eliminar")
async def eliminar_insumo_api(insumo_id: int, session: dict = Depends(require_session)):
    compra = await pool().fetchrow("SELECT detalle, total, responsable FROM compras_insumos WHERE id = $1", insumo_id)
    if not compra:
        return JSONResponse({"ok": False, "error": "Esa compra ya no existe."}, status_code=404)
    if session.get("role") != "admin" and compra["responsable"] != session.get("nombre"):
        return JSONResponse({"ok": False, "error": "Solo puedes eliminar las compras que registraste tú."}, status_code=403)
    await pool().execute("DELETE FROM compras_insumos WHERE id = $1", insumo_id)
    await bitacora.registrar(
        session, "Eliminó compra de insumo", f"Insumo #{insumo_id}: {compra['detalle']} — Bs {float(compra['total']):.2f} (desde la app)"
    )
    return JSONResponse({"ok": True})


@router_api.post("/{insumo_id}/final")
async def cantidad_final_api(insumo_id: int, session: dict = Depends(require_session), cantidad_final: str = Form("")):
    """Anota cuánto queda del insumo (cualquier usuario). Vacío = borrar lo anotado."""
    compra = await pool().fetchrow("SELECT detalle, cantidad, medida FROM compras_insumos WHERE id = $1", insumo_id)
    if not compra:
        return JSONResponse({"ok": False, "error": "Esa compra ya no existe."}, status_code=404)
    texto = cantidad_final.strip().replace(",", ".")
    final = None
    if texto:
        try:
            final = float(texto)
        except ValueError:
            return JSONResponse({"ok": False, "error": "Escribe un número."}, status_code=400)
        if final < 0 or final > float(compra["cantidad"]):
            return JSONResponse(
                {"ok": False, "error": f"Tiene que estar entre 0 y {float(compra['cantidad']):g} (lo que se compró)."},
                status_code=400,
            )
    await pool().execute("UPDATE compras_insumos SET cantidad_final = $1 WHERE id = $2", final, insumo_id)
    medida = compra["medida"] or ""
    await bitacora.registrar(
        session, "Anotó cantidad final de insumo",
        f"Insumo #{insumo_id}: {compra['detalle']} — queda {final:g} {medida} (desde la app)" if final is not None
        else f"Insumo #{insumo_id}: {compra['detalle']} — borró la cantidad final (desde la app)",
    )
    return JSONResponse({"ok": True})


@router_api.post("/medidas")
async def agregar_medida_api(session: dict = Depends(require_session), nombre: str = Form("")):
    nombre = nombre.strip().upper()
    if nombre:
        await pool().execute("INSERT INTO medidas_referencia (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING", nombre)
    return JSONResponse({"ok": bool(nombre), "nombre": nombre})


@router_api.post("/solicitantes")
async def agregar_solicitante_api(session: dict = Depends(require_session), nombre: str = Form("")):
    nombre = nombre.strip()
    if nombre:
        await pool().execute(
            "INSERT INTO solicitantes_referencia (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING", nombre
        )
    return JSONResponse({"ok": bool(nombre), "nombre": nombre})
