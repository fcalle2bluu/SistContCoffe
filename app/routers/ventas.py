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

DENOMINACIONES = (
    (200.0, "billete"), (100.0, "billete"), (50.0, "billete"), (20.0, "billete"), (10.0, "billete"),
    (5.0, "moneda"), (2.0, "moneda"), (1.0, "moneda"), (0.5, "moneda"), (0.2, "moneda"), (0.1, "moneda"),
)

CUENTA_CAJA_EFECTIVO = "1110101"  # CAJA MONEDA NACIONAL
CUENTA_VENTAS = "5010101"  # Ventas

TASA_IVA = 0.13
TASA_IT = 0.03
TASA_COMISION_LINKSER = 0.018

CUENTA_IT = "1160103"
CUENTA_IT_POR_PAGAR = "1160104"
CUENTA_IVA = "900006"
CUENTA_LINKSER = "502030102"
CUENTA_COMISION_LINKSER = "502030103"


async def _registrar_ventas_efectivo_en_diario(turno_id: int) -> None:
    """Al cerrar un turno, asienta en el Libro Diario el total de ventas en
    efectivo SIN factura de ese turno (Debe Caja, Haber Ventas). Las ventas
    EFEC/FAC y QR/FAC no pasan por aquí: llevan su propio desglose de IT/IVA
    en _registrar_ventas_facturadas_en_diario. Las ventas por QR/POS sin
    factura quedan fuera a propósito: ese tratamiento lo sigue armando el
    contador a mano."""
    total = await pool().fetchval(
        "SELECT COALESCE(SUM(total), 0) FROM ordenes "
        "WHERE turno_id = $1 AND estado = 'cobrada' AND tipo_pago = 'EFECTIVO'",
        turno_id,
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


async def _registrar_ventas_facturadas_en_diario(turno_id: int) -> None:
    """Al cerrar un turno, asienta las ventas con factura (EFEC/FAC y QR/FAC)
    desglosando IT (3%) e IVA (13%) sobre el total, igual que se calculaba a
    mano en el Excel. Las ventas QR/FAC pasan primero por Linkser, que cobra
    una comisión (1.8%) antes de depositar. Las ventas QR/POS sin factura
    siguen sin tocarse: ese tratamiento lo sigue armando el contador."""
    filas = await pool().fetch(
        "SELECT tipo_pago, COALESCE(SUM(total), 0) AS total FROM ordenes "
        "WHERE turno_id = $1 AND estado = 'cobrada' AND tipo_pago = ANY($2::text[]) "
        "GROUP BY tipo_pago",
        turno_id,
        ["EFEC/FAC", "QR/FAC"],
    )
    totales = {f["tipo_pago"]: float(f["total"]) for f in filas if f["total"] and f["total"] > 0}
    if not totales:
        return

    turno = await pool().fetchrow("SELECT responsable FROM turnos WHERE id = $1", turno_id)

    async with pool().acquire() as conn:
        async with conn.transaction():
            fecha = hoy_bolivia()
            siguiente = await conn.fetchval("SELECT COALESCE(MAX(nro_asiento), 0) + 1 FROM libro_diario")

            async def linea(nro: int, codigo: str, debe: float, haber: float, glosa: str) -> None:
                await conn.execute(
                    "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                    "VALUES ($1, $2, $3, $4, $5, $6)",
                    fecha, nro, codigo, debe, haber, glosa,
                )

            if "EFEC/FAC" in totales:
                total = totales["EFEC/FAC"]
                it = round(total * TASA_IT, 2)
                iva = round(total * TASA_IVA, 2)
                venta_neta = round(total - iva, 2)
                glosa = f"Ventas en efectivo con factura del turno de {turno['responsable']} (turno #{turno_id})."
                await linea(siguiente, CUENTA_CAJA_EFECTIVO, total, 0, glosa)
                await linea(siguiente, CUENTA_IT, it, 0, glosa)
                await linea(siguiente, CUENTA_IT_POR_PAGAR, 0, it, glosa)
                await linea(siguiente, CUENTA_IVA, 0, iva, glosa)
                await linea(siguiente, CUENTA_VENTAS, 0, venta_neta, glosa)
                siguiente += 1

            if "QR/FAC" in totales:
                total = totales["QR/FAC"]
                comision = round(total * TASA_COMISION_LINKSER, 2)
                neto_linkser = round(total - comision, 2)
                it = round(total * TASA_IT, 2)
                iva = round(total * TASA_IVA, 2)
                venta_neta = round(total - iva, 2)
                glosa = f"Ventas QR con factura (vía Linkser) del turno de {turno['responsable']} (turno #{turno_id})."
                await linea(siguiente, CUENTA_LINKSER, neto_linkser, 0, glosa)
                await linea(siguiente, CUENTA_COMISION_LINKSER, comision, 0, glosa)
                await linea(siguiente, CUENTA_IT, it, 0, glosa)
                await linea(siguiente, CUENTA_IT_POR_PAGAR, 0, it, glosa)
                await linea(siguiente, CUENTA_IVA, 0, iva, glosa)
                await linea(siguiente, CUENTA_VENTAS, 0, venta_neta, glosa)


def _calcular_descuento(items) -> float:
    """Suma el valor absoluto de los ítems con precio negativo (p. ej. el
    producto "DESCUENTO BS" en Ajustes), que es como se registran los
    descuentos manuales en una venta."""
    return sum(
        -float(it["cantidad"]) * float(it["precio_unitario"])
        for it in items
        if float(it["precio_unitario"]) < 0
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
                "SELECT orden_id, producto_nombre, cantidad, precio_unitario FROM orden_items "
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

    descuentos_por_orden = {oid: _calcular_descuento(items) for oid, items in items_por_orden.items()}

    resumen_pagos: dict[str, dict] = {t: {"cantidad": 0, "monto": 0.0} for t in TIPOS_PAGO}
    for o in ordenes_cobradas:
        tipo = o["tipo_pago"] or "—"
        fila = resumen_pagos.setdefault(tipo, {"cantidad": 0, "monto": 0.0})
        fila["cantidad"] += 1
        fila["monto"] += float(o["total"])
    resumen_pagos = {t: v for t, v in resumen_pagos.items() if v["cantidad"] > 0}

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
        "descuentos_por_orden": descuentos_por_orden,
        "egresos_lista": egresos_lista,
        "ingresos_efectivo": ingresos_efectivo,
        "egresos_efectivo": egresos_efectivo,
        "egresos_totales": egresos_totales,
        "ventas_totales": ventas_totales,
        "resumen_pagos": resumen_pagos,
        "efectivo_teorico": (float(turno["monto_inicial"]) + ingresos_efectivo - egresos_efectivo) if turno else 0,
        "cobrar_id": cobrar_id,
        "tipos_pago": TIPOS_PAGO,
        "denominaciones": DENOMINACIONES,
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


@router.post("/ordenes/{orden_id}/eliminar")
async def eliminar_orden(orden_id: int, session: dict = Depends(require_session)):
    orden = await pool().fetchrow("SELECT mesa, total, tipo_pago FROM ordenes WHERE id = $1", orden_id)
    if orden:
        await pool().execute("DELETE FROM ordenes WHERE id = $1", orden_id)
        await bitacora.registrar(
            session, "Eliminó venta", f"Orden #{orden_id}, mesa {orden['mesa']}, Bs {orden['total']:.2f}"
        )
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
    descuento = _calcular_descuento(items)
    subtotal = float(orden["total"]) + descuento
    return templates.TemplateResponse(
        request, "ticket.html", {"orden": orden, "items": items, "descuento": descuento, "subtotal": subtotal}
    )


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


@router.post("/turno/{turno_id}/apertura", response_class=HTMLResponse)
async def editar_apertura_turno(
    request: Request, turno_id: int, session: dict = Depends(require_session), monto_inicial: str = Form("")
):
    try:
        monto = float(monto_inicial)
    except ValueError:
        monto = -1

    if monto < 0:
        ctx = await _ventas_context(session, error="Ingresa un monto de apertura válido.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    anterior = await pool().fetchval(
        "SELECT monto_inicial FROM turnos WHERE id = $1 AND estado = 'abierto'", turno_id
    )
    if anterior is None:
        ctx = await _ventas_context(session, error="Ese turno ya no está abierto.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    await pool().execute("UPDATE turnos SET monto_inicial = $1 WHERE id = $2", monto, turno_id)
    await bitacora.registrar(
        session, "Corrigió apertura de turno", f"Turno #{turno_id}: Bs {float(anterior):.2f} → Bs {monto:.2f}"
    )
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/turno/{turno_id}/cerrar", response_class=HTMLResponse)
async def cerrar_turno(
    request: Request,
    turno_id: int,
    session: dict = Depends(require_session),
    corte: list[str] = Form([]),
    cantidad: list[str] = Form([]),
):
    cortes_validos = {c: t for c, t in DENOMINACIONES}
    conteo: list[tuple[float, str, int]] = []
    total = 0.0
    for c_txt, q_txt in zip(corte, cantidad):
        try:
            c = float(c_txt)
            q = int(q_txt)
        except ValueError:
            continue
        if c not in cortes_validos or q <= 0:
            continue
        conteo.append((c, cortes_validos[c], q))
        total += c * q

    if not conteo:
        ctx = await _ventas_context(session, error="Ingresa el arqueo de caja (cantidad de billetes y monedas) para cerrar el turno.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    resultado = await pool().execute(
        "UPDATE turnos SET estado = 'cerrado', monto_final_declarado = $1, cerrado_en = now() "
        "WHERE id = $2 AND estado = 'abierto'",
        total,
        turno_id,
    )
    if resultado == "UPDATE 1":
        async with pool().acquire() as conn:
            async with conn.transaction():
                for c, t, q in conteo:
                    await conn.execute(
                        "INSERT INTO conteo_caja (turno_id, corte, tipo, cantidad) VALUES ($1, $2, $3, $4)",
                        turno_id, c, t, q,
                    )
        await _registrar_ventas_efectivo_en_diario(turno_id)
        await _registrar_ventas_facturadas_en_diario(turno_id)
        await bitacora.registrar(session, "Cerró turno", f"Turno #{turno_id}, monto final Bs {total:.2f} (arqueo de caja)")

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
