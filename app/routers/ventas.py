from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_session
from app.templating import templates
from app.tz import hoy_bolivia

router = APIRouter(prefix="/dashboard/ventas")

PAGOS_EFECTIVO = ("EFECTIVO", "EFEC/FAC")
TIPOS_PAGO = ("EFECTIVO", "QR", "POS", "EFEC/FAC", "QR/FAC")

CUENTA_CAJA_EFECTIVO = "1110101"  # CAJA MONEDA NACIONAL
CUENTA_VENTAS = "5010101"  # Ventas


async def _registrar_ventas_efectivo_en_diario(turno_id: int) -> None:
    """Al cerrar un turno, asienta en el Libro Diario el total de ventas en
    efectivo de ese turno (Debe Caja, Haber Ventas). Las ventas por QR/tarjeta
    quedan fuera a propósito: llevan comisión de Linkser y crédito fiscal, un
    tratamiento que el contador sigue armando a mano."""
    total = await pool().fetchval(
        "SELECT COALESCE(SUM(total), 0) FROM ordenes "
        "WHERE turno_id = $1 AND estado = 'cobrada' AND tipo_pago = ANY($2::text[])",
        turno_id,
        list(PAGOS_EFECTIVO),
    )
    if not total or total <= 0:
        return

    turno = await pool().fetchrow("SELECT responsable FROM turnos WHERE id = $1", turno_id)
    glosa = f"Ventas en efectivo del turno de {turno['responsable']} (cierre de caja, turno #{turno_id})."
    fecha = hoy_bolivia()

    async with pool().acquire() as conn:
        async with conn.transaction():
            siguiente = await conn.fetchval("SELECT COALESCE(MAX(nro_asiento), 0) + 1 FROM libro_diario")
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, $4, 0, $5)",
                fecha, siguiente, CUENTA_CAJA_EFECTIVO, float(total), glosa,
            )
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, 0, $4, $5)",
                fecha, siguiente, CUENTA_VENTAS, float(total), glosa,
            )


async def _resolver_items_pedido(cart_producto_id: list[str], cart_cantidad: list[str]) -> list[dict]:
    productos_map = {p["id"]: p for p in await pool().fetch("SELECT id, nombre, precio_venta FROM productos")}
    cart: dict[int, dict] = {}
    for pid_txt, cant_txt in zip(cart_producto_id, cart_cantidad):
        try:
            pid = int(pid_txt)
            cantidad = float(cant_txt)
        except ValueError:
            continue
        producto = productos_map.get(pid)
        if not producto or cantidad <= 0:
            continue
        if pid in cart:
            cart[pid]["cantidad"] += cantidad
        else:
            cart[pid] = {
                "producto_id": pid,
                "producto_nombre": producto["nombre"],
                "cantidad": cantidad,
                "precio_unitario": float(producto["precio_venta"]),
            }
    return list(cart.values())


async def _ventas_context(
    session: dict, cobrar_id: int | None = None, error: str | None = None, mesa_seleccionada: str | None = None
) -> dict:
    turno = await pool().fetchrow(
        "SELECT id, responsable, monto_inicial, abierto_en FROM turnos WHERE estado = 'abierto'"
    )
    mesas = await pool().fetch("SELECT id, nombre FROM mesas_referencia ORDER BY nombre")
    productos = await pool().fetch(
        "SELECT id, nombre, categoria, precio_venta FROM productos ORDER BY categoria, nombre"
    )

    ordenes_abiertas, ordenes_cobradas, egresos_efectivo, egresos_totales = [], [], 0.0, 0.0
    items_por_orden: dict[int, list] = {}
    egresos_lista: list = []
    if turno:
        ordenes_abiertas = await pool().fetch(
            "SELECT id, mesa, total, responsable, creado_en FROM ordenes "
            "WHERE turno_id = $1 AND estado = 'abierta' ORDER BY creado_en DESC",
            turno["id"],
        )
        ordenes_cobradas = await pool().fetch(
            "SELECT id, mesa, total, tipo_pago, responsable, cobrado_en FROM ordenes "
            "WHERE turno_id = $1 AND estado = 'cobrada' ORDER BY cobrado_en DESC",
            turno["id"],
        )
        if ordenes_cobradas:
            item_rows = await pool().fetch(
                "SELECT orden_id, producto_nombre, cantidad FROM orden_items "
                "WHERE orden_id = ANY($1::int[]) ORDER BY id",
                [o["id"] for o in ordenes_cobradas],
            )
            for r in item_rows:
                items_por_orden.setdefault(r["orden_id"], []).append(r)
        movimientos = await pool().fetch(
            "SELECT id, monto, tipo_pago, motivo, responsable, creado_en FROM movimientos_caja "
            "WHERE turno_id = $1 AND tipo = 'egreso' ORDER BY creado_en DESC",
            turno["id"],
        )
        egresos_totales = sum(float(m["monto"]) for m in movimientos)
        egresos_efectivo = sum(float(m["monto"]) for m in movimientos if m["tipo_pago"] in PAGOS_EFECTIVO)
        egresos_lista = movimientos

    ingresos_efectivo = sum(float(o["total"]) for o in ordenes_cobradas if o["tipo_pago"] in PAGOS_EFECTIVO)
    ventas_totales = sum(float(o["total"]) for o in ordenes_cobradas)

    por_categoria: dict[str, list] = {}
    for p in productos:
        por_categoria.setdefault(p["categoria"], []).append(p)

    return {
        "session": session,
        "active": "ventas",
        "turno": turno,
        "mesas": mesas,
        "mesa_seleccionada": mesa_seleccionada,
        "productos": productos,
        "por_categoria": por_categoria,
        "ordenes_abiertas": ordenes_abiertas,
        "ordenes_cobradas": ordenes_cobradas,
        "items_por_orden": items_por_orden,
        "egresos_lista": egresos_lista,
        "ingresos_efectivo": ingresos_efectivo,
        "egresos_efectivo": egresos_efectivo,
        "egresos_totales": egresos_totales,
        "ventas_totales": ventas_totales,
        "efectivo_teorico": (float(turno["monto_inicial"]) + ingresos_efectivo - egresos_efectivo) if turno else 0,
        "cobrar_id": cobrar_id,
        "tipos_pago": TIPOS_PAGO,
        "error": error,
    }


@router.get("", response_class=HTMLResponse)
async def ventas_page(request: Request, session: dict = Depends(require_session), cobrar: int | None = None):
    ctx = await _ventas_context(session, cobrar_id=cobrar)
    return templates.TemplateResponse(request, "dashboard/ventas.html", ctx)


@router.post("/mesas", response_class=HTMLResponse)
async def agregar_mesa(request: Request, session: dict = Depends(require_session), nombre_nueva: str = Form("")):
    nombre_nueva = nombre_nueva.strip().upper()
    if nombre_nueva:
        await pool().execute(
            "INSERT INTO mesas_referencia (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING", nombre_nueva
        )
        await bitacora.registrar(session, "Agregó mesa/referencia", nombre_nueva)
    mesas = await pool().fetch("SELECT id, nombre FROM mesas_referencia ORDER BY nombre")
    return templates.TemplateResponse(
        request, "partials/_mesa_select.html", {"mesas": mesas, "mesa_seleccionada": nombre_nueva}
    )


@router.post("/ordenes", response_class=HTMLResponse)
async def crear_orden(
    request: Request,
    session: dict = Depends(require_session),
    turno_id: str = Form(""),
    mesa: str = Form(""),
    accion: str = Form("pendiente"),
    tipo_pago: str = Form(""),
    monto_pagado: str = Form(""),
    observacion: str = Form(""),
    cart_producto_id: list[str] = Form([]),
    cart_cantidad: list[str] = Form([]),
):
    mesa = mesa.strip()
    cart = await _resolver_items_pedido(cart_producto_id, cart_cantidad)

    error = None
    if not turno_id:
        error = "No hay un turno abierto."
    elif not mesa:
        error = "Indica la mesa o referencia del pedido."
    elif not cart:
        error = "Agrega al menos un producto."
    elif accion == "cobrar" and not tipo_pago.strip():
        error = "Elige el método de pago para cobrar."

    if error:
        ctx = await _ventas_context(session, error=error, mesa_seleccionada=mesa)
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    total = sum(it["cantidad"] * it["precio_unitario"] for it in cart)
    cobrando = accion == "cobrar"
    ahora = datetime.now(timezone.utc) if cobrando else None

    async with pool().acquire() as conn:
        async with conn.transaction():
            orden_id = await conn.fetchval(
                """
                INSERT INTO ordenes (turno_id, mesa, estado, tipo_pago, monto_pagado, responsable, observacion, total, cobrado_en)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
                """,
                int(turno_id),
                mesa,
                "cobrada" if cobrando else "abierta",
                tipo_pago.strip() if cobrando else None,
                float(monto_pagado) if cobrando and monto_pagado else None,
                session["nombre"],
                observacion.strip() or None,
                total,
                ahora,
            )
            for it in cart:
                await conn.execute(
                    """
                    INSERT INTO orden_items (orden_id, producto_id, producto_nombre, cantidad, precio_unitario)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    orden_id,
                    it["producto_id"],
                    it["producto_nombre"],
                    it["cantidad"],
                    it["precio_unitario"],
                )

    accion = "Cobró venta" if cobrando else "Creó pedido"
    detalle = f"Mesa {mesa}, total Bs {total:.2f}" + (f", {tipo_pago.strip()}" if cobrando else "")
    await bitacora.registrar(session, accion, detalle)

    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/ordenes/{orden_id}/cobrar")
async def cobrar_orden_pendiente(
    orden_id: int,
    session: dict = Depends(require_session),
    tipo_pago: str = Form(""),
    monto_pagado: str = Form(""),
):
    if tipo_pago.strip():
        await pool().execute(
            "UPDATE ordenes SET estado = 'cobrada', tipo_pago = $1, monto_pagado = $2, cobrado_en = now() "
            "WHERE id = $3 AND estado = 'abierta'",
            tipo_pago.strip(),
            float(monto_pagado) if monto_pagado else None,
            orden_id,
        )
        await bitacora.registrar(session, "Cobró venta pendiente", f"Orden #{orden_id}, {tipo_pago.strip()}")
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/ordenes/{orden_id}/cancelar")
async def cancelar_orden(orden_id: int, session: dict = Depends(require_session)):
    await pool().execute("UPDATE ordenes SET estado = 'cancelada' WHERE id = $1", orden_id)
    await bitacora.registrar(session, "Canceló pedido", f"Orden #{orden_id}")
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.get("/ordenes/{orden_id}/ticket", response_class=HTMLResponse)
async def ticket_orden(request: Request, orden_id: int, session: dict = Depends(require_session)):
    orden = await pool().fetchrow(
        "SELECT id, mesa, total, tipo_pago, responsable, creado_en, cobrado_en FROM ordenes WHERE id = $1",
        orden_id,
    )
    if not orden:
        return RedirectResponse("/dashboard/ventas", status_code=303)
    items = await pool().fetch(
        "SELECT producto_nombre, cantidad, precio_unitario FROM orden_items WHERE orden_id = $1 ORDER BY id",
        orden_id,
    )
    return templates.TemplateResponse(request, "ticket.html", {"orden": orden, "items": items})


@router.post("/turno/abrir", response_class=HTMLResponse)
async def abrir_turno(request: Request, session: dict = Depends(require_session), monto_inicial: str = Form("")):
    try:
        monto = float(monto_inicial)
    except ValueError:
        monto = -1

    if monto < 0:
        ctx = await _ventas_context(session, error="Ingresa un monto inicial válido.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    abierto = await pool().fetchrow("SELECT id FROM turnos WHERE estado = 'abierto'")
    if abierto:
        ctx = await _ventas_context(session, error="Ya hay un turno abierto.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    await pool().execute(
        "INSERT INTO turnos (responsable, monto_inicial, estado) VALUES ($1, $2, 'abierto')",
        session["nombre"],
        monto,
    )
    await bitacora.registrar(session, "Abrió turno", f"Monto inicial Bs {monto:.2f}")
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/turno/{turno_id}/cerrar", response_class=HTMLResponse)
async def cerrar_turno(
    request: Request, turno_id: int, session: dict = Depends(require_session), monto_final_declarado: str = Form("")
):
    try:
        monto_final = float(monto_final_declarado)
    except ValueError:
        ctx = await _ventas_context(session, error="Ingresa el monto final contado en caja.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    resultado = await pool().execute(
        "UPDATE turnos SET estado = 'cerrado', monto_final_declarado = $1, cerrado_en = now() "
        "WHERE id = $2 AND estado = 'abierto'",
        monto_final,
        turno_id,
    )
    if resultado == "UPDATE 1":
        await _registrar_ventas_efectivo_en_diario(turno_id)
        await bitacora.registrar(session, "Cerró turno", f"Turno #{turno_id}, monto final Bs {monto_final:.2f}")

    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/movimientos", response_class=HTMLResponse)
async def registrar_movimiento_caja(
    request: Request,
    session: dict = Depends(require_session),
    turno_id: str = Form(""),
    monto: str = Form(""),
    motivo: str = Form(""),
    tipo_pago: str = Form(""),
):
    motivo = motivo.strip()
    tipo_pago = tipo_pago.strip()
    try:
        monto_num = float(monto)
    except ValueError:
        monto_num = 0

    if not turno_id or monto_num <= 0 or not motivo or tipo_pago not in TIPOS_PAGO:
        ctx = await _ventas_context(session, error="Completa motivo, método de pago y monto (mayor a 0).")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    await pool().execute(
        "INSERT INTO movimientos_caja (turno_id, tipo, monto, motivo, responsable, tipo_pago) "
        "VALUES ($1, 'egreso', $2, $3, $4, $5)",
        int(turno_id),
        monto_num,
        motivo,
        session["nombre"],
        tipo_pago,
    )
    await bitacora.registrar(session, "Registró egreso de caja", f"Bs {monto_num:.2f} — {motivo}")
    return RedirectResponse("/dashboard/ventas", status_code=303)
