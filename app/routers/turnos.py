from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_admin
from app.routers.contabilidad import _agrupar_asientos
from app.routers.ventas import DENOMINACIONES, TIPOS_PAGO, _calcular_descuento, _efectivo_teorico_turno
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
        "SELECT id, mesa, estado, total, tipo_pago, responsable, creado_en, cobrado_en, observacion, "
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
        "SELECT id, tipo, monto, motivo, tipo_pago, categoria, responsable, creado_en FROM movimientos_caja "
        "WHERE turno_id = $1 ORDER BY creado_en",
        turno_id,
    )
    egresos_lista = [m for m in movimientos if m["tipo"] == "egreso"]
    ingresos_lista = [m for m in movimientos if m["tipo"] == "ingreso"]
    ventas_totales = sum(float(o["total"]) for o in ordenes if o["estado"] == "cobrada")
    egresos_totales = sum(float(m["monto"]) for m in egresos_lista)
    ingresos_caja_totales = sum(float(m["monto"]) for m in ingresos_lista)

    pago_rows = await pool().fetch(
        "SELECT op.tipo_pago, COUNT(*) AS cantidad, SUM(op.monto) AS monto FROM orden_pagos op "
        "JOIN ordenes o ON o.id = op.orden_id WHERE o.turno_id = $1 GROUP BY op.tipo_pago",
        turno_id,
    )
    resumen_pagos = {
        r["tipo_pago"] or "—": {"cantidad": r["cantidad"], "monto": float(r["monto"])} for r in pago_rows
    }
    resumen_ingresos_caja: dict[str, dict] = {}
    for m in ingresos_lista:
        tipo = m["tipo_pago"] or "—"
        fila = resumen_ingresos_caja.setdefault(tipo, {"cantidad": 0, "monto": 0.0})
        fila["cantidad"] += 1
        fila["monto"] += float(m["monto"])

    arqueo = await pool().fetch(
        "SELECT corte, tipo, cantidad, subtotal FROM conteo_caja WHERE turno_id = $1 ORDER BY corte DESC",
        turno_id,
    )
    arqueo_por_corte = {float(a["corte"]): a["cantidad"] for a in arqueo}

    # Los asientos que el cierre de turno genera solo en Libro Diario dejan
    # "turno #<id>)." al final de la glosa (ver _registrar_ventas_*_en_diario
    # en ventas.py) — no hay una columna turno_id en libro_diario, así que se
    # identifican por ese texto. Los egresos/ingresos de caja no quedan
    # ligados a un turno en su glosa, así que no aparecen acá.
    filas_diario = await pool().fetch(
        "SELECT ld.fecha, ld.nro_asiento, ld.codigo_cuenta, cc.nombre AS cuenta_nombre, ld.debe, ld.haber, ld.glosa "
        "FROM libro_diario ld LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta "
        "WHERE ld.glosa LIKE '%turno #' || $1 || ').' "
        "ORDER BY ld.nro_asiento, ld.id",
        str(turno_id),
    )
    asientos_turno = _agrupar_asientos(filas_diario)

    categorias_egreso = await pool().fetch("SELECT nombre FROM categorias_egreso_referencia ORDER BY nombre")

    # Comparación del arqueo: si el turno ya está cerrado, "completo" o
    # "incompleto" (sobra/falta) contra lo que la caja debería tener según
    # ventas y movimientos; si sigue abierto, se muestra el esperado en vivo
    # (todavía no hay monto contado con el que compararlo).
    teorico = await _efectivo_teorico_turno(turno_id, turno["monto_inicial"])
    estado_arqueo = None
    diferencia_arqueo = 0.0
    if turno["estado"] == "cerrado" and turno["monto_final_declarado"] is not None:
        diferencia_arqueo = round(float(turno["monto_final_declarado"]) - teorico, 2)
        if abs(diferencia_arqueo) < 0.01:
            estado_arqueo = "completo"
        elif diferencia_arqueo > 0:
            estado_arqueo = "sobra"
        else:
            estado_arqueo = "falta"

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
            "categorias_egreso": categorias_egreso,
            "tipos_pago": TIPOS_PAGO,
            "efectivo_teorico": teorico,
            "estado_arqueo": estado_arqueo,
            "diferencia_arqueo": abs(diferencia_arqueo),
            "ventas_totales": ventas_totales,
            "egresos_totales": egresos_totales,
            "ingresos_caja_totales": ingresos_caja_totales,
            "resumen_pagos": resumen_pagos,
            "resumen_ingresos_caja": resumen_ingresos_caja,
            "asientos_turno": asientos_turno,
            "arqueo_por_corte": arqueo_por_corte,
            "denominaciones": DENOMINACIONES,
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
