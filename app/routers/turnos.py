from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_admin
from app.routers.ventas import _calcular_descuento
from app.templating import templates

router = APIRouter(prefix="/dashboard/turnos")


@router.get("", response_class=HTMLResponse)
async def turnos_page(request: Request, session: dict = Depends(require_admin)):
    turnos = await pool().fetch(
        """
        SELECT t.id, t.responsable, t.estado, t.monto_inicial, t.monto_final_declarado,
               t.abierto_en, t.cerrado_en,
               ROW_NUMBER() OVER (ORDER BY t.abierto_en) AS numero,
               COALESCE(v.cantidad_ventas, 0) AS cantidad_ventas,
               COALESCE(v.total_ventas, 0) AS total_ventas,
               COALESCE(m.cantidad_movimientos, 0) AS cantidad_movimientos
        FROM turnos t
        LEFT JOIN (
            SELECT turno_id, COUNT(*) AS cantidad_ventas, SUM(total) AS total_ventas
            FROM ordenes WHERE estado = 'cobrada' GROUP BY turno_id
        ) v ON v.turno_id = t.id
        LEFT JOIN (
            SELECT turno_id, COUNT(*) AS cantidad_movimientos FROM movimientos_caja GROUP BY turno_id
        ) m ON m.turno_id = t.id
        ORDER BY t.abierto_en DESC
        """
    )
    return templates.TemplateResponse(
        request, "dashboard/turnos.html", {"session": session, "active": "turnos", "turnos": turnos}
    )


@router.get("/{turno_id}", response_class=HTMLResponse)
async def turno_detalle(request: Request, turno_id: int, session: dict = Depends(require_admin)):
    turno = await pool().fetchrow("SELECT * FROM turnos WHERE id = $1", turno_id)
    if not turno:
        return RedirectResponse("/dashboard/turnos", status_code=303)

    ordenes = await pool().fetch(
        "SELECT id, mesa, estado, total, tipo_pago, responsable, creado_en, cobrado_en, "
        "factura_nit, factura_celular, factura_nombre FROM ordenes "
        "WHERE turno_id = $1 ORDER BY creado_en",
        turno_id,
    )
    items_por_orden: dict[int, list] = {}
    if ordenes:
        item_rows = await pool().fetch(
            "SELECT orden_id, producto_nombre, cantidad, precio_unitario FROM orden_items "
            "WHERE orden_id = ANY($1::int[]) ORDER BY id",
            [o["id"] for o in ordenes],
        )
        for r in item_rows:
            items_por_orden.setdefault(r["orden_id"], []).append(r)
    descuentos_por_orden = {oid: _calcular_descuento(items) for oid, items in items_por_orden.items()}

    movimientos = await pool().fetch(
        "SELECT id, tipo, monto, motivo, tipo_pago, responsable, creado_en FROM movimientos_caja "
        "WHERE turno_id = $1 ORDER BY creado_en",
        turno_id,
    )

    arqueo = await pool().fetch(
        "SELECT corte, tipo, cantidad, subtotal FROM conteo_caja WHERE turno_id = $1 ORDER BY corte DESC",
        turno_id,
    )

    return templates.TemplateResponse(
        request,
        "dashboard/turno_detalle.html",
        {
            "session": session,
            "active": "turnos",
            "turno": turno,
            "ordenes": ordenes,
            "items_por_orden": items_por_orden,
            "descuentos_por_orden": descuentos_por_orden,
            "movimientos": movimientos,
            "arqueo": arqueo,
        },
    )


@router.post("/{turno_id}/eliminar")
async def eliminar_turno(turno_id: int, session: dict = Depends(require_admin)):
    turno = await pool().fetchrow("SELECT responsable, estado, abierto_en FROM turnos WHERE id = $1", turno_id)
    if turno:
        async with pool().acquire() as conn:
            async with conn.transaction():
                cant_ordenes = await conn.fetchval(
                    "SELECT COUNT(*) FROM ordenes WHERE turno_id = $1", turno_id
                )
                cant_movs = await conn.fetchval(
                    "SELECT COUNT(*) FROM movimientos_caja WHERE turno_id = $1", turno_id
                )
                await conn.execute("DELETE FROM ordenes WHERE turno_id = $1", turno_id)
                await conn.execute("DELETE FROM movimientos_caja WHERE turno_id = $1", turno_id)
                await conn.execute("DELETE FROM turnos WHERE id = $1", turno_id)
        await bitacora.registrar(
            session,
            "Eliminó turno completo",
            f"Turno #{turno_id} ({turno['responsable']}, {turno['estado']}): "
            f"{cant_ordenes} ventas y {cant_movs} movimientos borrados. "
            f"Si el turno estaba cerrado, revisa el Libro Diario por si quedó un asiento que corregir a mano.",
        )
    return RedirectResponse("/dashboard/turnos", status_code=303)
