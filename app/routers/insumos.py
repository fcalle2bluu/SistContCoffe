from datetime import date

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_session
from app.templating import templates

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
