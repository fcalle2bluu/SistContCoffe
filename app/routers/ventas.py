from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.db import pool
from app.deps import require_dashboard, require_session
from app.templating import templates

router = APIRouter(prefix="/dashboard/ventas")

PAGOS_EFECTIVO = ("EFECTIVO", "EFEC/FAC")
TIPOS_PAGO = ("EFECTIVO", "QR", "POS", "EFEC/FAC", "QR/FAC")


def _parse_cart(
    cart_producto_id: list[str], cart_nombre: list[str], cart_cantidad: list[str], cart_precio: list[str]
) -> list[dict]:
    items = []
    for pid, nombre, cant, precio in zip(cart_producto_id, cart_nombre, cart_cantidad, cart_precio):
        items.append(
            {
                "producto_id": int(pid),
                "producto_nombre": nombre,
                "cantidad": float(cant),
                "precio_unitario": float(precio),
            }
        )
    return items


async def _ventas_context(session: dict, cobrar_id: int | None = None, error: str | None = None) -> dict:
    turno = await pool().fetchrow(
        "SELECT id, responsable, monto_inicial, abierto_en FROM turnos WHERE estado = 'abierto'"
    )
    productos = await pool().fetch(
        "SELECT id, nombre, categoria, precio_venta FROM productos ORDER BY categoria, nombre"
    )

    ordenes_abiertas, ordenes_cobradas, egresos_efectivo, egresos_totales = [], [], 0.0, 0.0
    items_por_orden: dict[int, list] = {}
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
            "SELECT monto, tipo_pago FROM movimientos_caja WHERE turno_id = $1 AND tipo = 'egreso'", turno["id"]
        )
        egresos_totales = sum(float(m["monto"]) for m in movimientos)
        egresos_efectivo = sum(float(m["monto"]) for m in movimientos if m["tipo_pago"] in PAGOS_EFECTIVO)

    ingresos_efectivo = sum(float(o["total"]) for o in ordenes_cobradas if o["tipo_pago"] in PAGOS_EFECTIVO)
    ventas_totales = sum(float(o["total"]) for o in ordenes_cobradas)

    por_categoria: dict[str, list] = {}
    for p in productos:
        por_categoria.setdefault(p["categoria"], []).append(p)

    return {
        "session": session,
        "active": "ventas",
        "turno": turno,
        "productos": productos,
        "por_categoria": por_categoria,
        "ordenes_abiertas": ordenes_abiertas,
        "ordenes_cobradas": ordenes_cobradas,
        "items_por_orden": items_por_orden,
        "ingresos_efectivo": ingresos_efectivo,
        "egresos_efectivo": egresos_efectivo,
        "egresos_totales": egresos_totales,
        "ventas_totales": ventas_totales,
        "efectivo_teorico": (float(turno["monto_inicial"]) + ingresos_efectivo - egresos_efectivo) if turno else 0,
        "cobrar_id": cobrar_id,
        "cart": [],
        "total": 0,
        "tipos_pago": TIPOS_PAGO,
        "error": error,
    }


@router.get("", response_class=HTMLResponse)
async def ventas_page(request: Request, session: dict = Depends(require_dashboard), cobrar: int | None = None):
    ctx = await _ventas_context(session, cobrar_id=cobrar)
    return templates.TemplateResponse(request, "dashboard/ventas.html", ctx)


@router.post("/carrito", response_class=HTMLResponse)
async def agregar_al_carrito(
    request: Request,
    session: dict = Depends(require_session),
    cart_producto_id: list[str] = Form([]),
    cart_nombre: list[str] = Form([]),
    cart_cantidad: list[str] = Form([]),
    cart_precio: list[str] = Form([]),
    producto_id_selector: str = Form(""),
    cantidad_selector: str = Form("1"),
):
    cart = _parse_cart(cart_producto_id, cart_nombre, cart_cantidad, cart_precio)

    if producto_id_selector:
        producto = await pool().fetchrow(
            "SELECT id, nombre, precio_venta FROM productos WHERE id = $1", int(producto_id_selector)
        )
        cantidad = float(cantidad_selector or "1")
        if producto and cantidad > 0:
            existente = next((it for it in cart if it["producto_id"] == producto["id"]), None)
            if existente:
                existente["cantidad"] += cantidad
            else:
                cart.append(
                    {
                        "producto_id": producto["id"],
                        "producto_nombre": producto["nombre"],
                        "cantidad": cantidad,
                        "precio_unitario": float(producto["precio_venta"]),
                    }
                )

    total = sum(it["cantidad"] * it["precio_unitario"] for it in cart)
    return templates.TemplateResponse(request, "partials/_carrito.html", {"cart": cart, "total": total})


@router.post("/carrito/quitar", response_class=HTMLResponse)
async def quitar_del_carrito(
    request: Request,
    session: dict = Depends(require_session),
    cart_producto_id: list[str] = Form([]),
    cart_nombre: list[str] = Form([]),
    cart_cantidad: list[str] = Form([]),
    cart_precio: list[str] = Form([]),
    quitar_id: str = Form(""),
):
    cart = _parse_cart(cart_producto_id, cart_nombre, cart_cantidad, cart_precio)
    cart = [it for it in cart if str(it["producto_id"]) != quitar_id]
    total = sum(it["cantidad"] * it["precio_unitario"] for it in cart)
    return templates.TemplateResponse(request, "partials/_carrito.html", {"cart": cart, "total": total})


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
    cart_nombre: list[str] = Form([]),
    cart_cantidad: list[str] = Form([]),
    cart_precio: list[str] = Form([]),
):
    mesa = mesa.strip()
    cart = _parse_cart(cart_producto_id, cart_nombre, cart_cantidad, cart_precio)

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
        ctx = await _ventas_context(session, error=error)
        ctx["cart"] = cart
        ctx["total"] = sum(it["cantidad"] * it["precio_unitario"] for it in cart)
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
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/ordenes/{orden_id}/cancelar")
async def cancelar_orden(orden_id: int, session: dict = Depends(require_session)):
    await pool().execute("UPDATE ordenes SET estado = 'cancelada' WHERE id = $1", orden_id)
    return RedirectResponse("/dashboard/ventas", status_code=303)


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

    await pool().execute(
        "UPDATE turnos SET estado = 'cerrado', monto_final_declarado = $1, cerrado_en = now() "
        "WHERE id = $2 AND estado = 'abierto'",
        monto_final,
        turno_id,
    )
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
    return RedirectResponse("/dashboard/ventas", status_code=303)
