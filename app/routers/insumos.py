from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.db import pool
from app.deps import require_dashboard, require_session
from app.templating import templates

router = APIRouter(prefix="/dashboard/insumos")

SELECT_INSUMOS = (
    "SELECT id, fecha, detalle, cantidad, medida, respaldo, precio_unitario, total, solicitante, responsable "
    "FROM compras_insumos ORDER BY fecha DESC, id DESC"
)


@router.get("", response_class=HTMLResponse)
async def insumos_page(request: Request, session: dict = Depends(require_dashboard), error: str | None = None):
    insumos = await pool().fetch(SELECT_INSUMOS)
    total_general = sum(float(i["total"]) for i in insumos)
    return templates.TemplateResponse(
        request,
        "dashboard/insumos.html",
        {"session": session, "active": "insumos", "insumos": insumos, "total_general": total_general, "error": error},
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
        return templates.TemplateResponse(
            request,
            "dashboard/insumos.html",
            {
                "session": session,
                "active": "insumos",
                "insumos": insumos,
                "total_general": total_general,
                "error": error,
            },
            status_code=400,
        )

    await pool().execute(
        """
        INSERT INTO compras_insumos (fecha, detalle, cantidad, medida, respaldo, precio_unitario, solicitante, responsable)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        fecha,
        detalle,
        cantidad_num,
        medida.strip() or None,
        respaldo.strip() or None,
        precio_num,
        solicitante.strip() or None,
        session["nombre"],
    )
    return RedirectResponse("/dashboard/insumos", status_code=303)


@router.post("/{insumo_id}/eliminar")
async def eliminar_compra_insumo(insumo_id: int, session: dict = Depends(require_session)):
    await pool().execute("DELETE FROM compras_insumos WHERE id = $1", insumo_id)
    return RedirectResponse("/dashboard/insumos", status_code=303)
