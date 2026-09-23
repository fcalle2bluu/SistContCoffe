from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_admin, require_session
from app.templating import templates
from app.tz import hoy_bolivia

router = APIRouter(prefix="/dashboard/ventas")

PAGOS_EFECTIVO = ("EFECTIVO", "EFEC/FAC")
TIPOS_PAGO = ("EFECTIVO", "QR", "POS", "EFEC/FAC", "QR/FAC", "POS/FAC")
TIPOS_FACTURADOS = ("EFEC/FAC", "QR/FAC", "POS/FAC")

DENOMINACIONES = (
    (200.0, "billete"), (100.0, "billete"), (50.0, "billete"), (20.0, "billete"), (10.0, "billete"),
    (5.0, "moneda"), (2.0, "moneda"), (1.0, "moneda"), (0.5, "moneda"), (0.2, "moneda"), (0.1, "moneda"),
)

CUENTA_CAJA_EFECTIVO = "1110101"  # CAJA MONEDA NACIONAL
CUENTA_CAJA_CHICA = "1110102"  # CAJA CHICA — adonde va la plata cuando se traslada desde la caja
CUENTA_BANCO = "1110103"  # BANCO BISA
CUENTA_VENTAS = "5010101"  # Ventas
CUENTA_GASTOS_ADMINISTRATIVOS = "405"  # GASTOS ADMINISTRATIVOS (categorías de egreso sin cuenta propia todavía)
CUENTA_INSUMOS_ALIMENTICIOS = "11506"  # INSUMOS ALIMENTICIOS
CUENTA_PRODUCTOS_LIMPIEZA = "11402"  # PRODUCTOS DE LIMPIEZA
CUENTA_SERVICIOS_EXTERNOS = "900008"  # SERVICIOS EXTERNOS

# Categoría de egreso (en minúsculas) → cuenta contable a la que se debita.
# Las categorías que no están acá (p. ej. "Servicios de limpieza", "Publicidad
# y marketing", "Impuestos") todavía no tienen una cuenta propia en el plan de
# cuentas, así que siguen yendo a Gastos Administrativos hasta que se cree una.
CUENTAS_POR_CATEGORIA_EGRESO = {
    "insumos alimenticios": CUENTA_INSUMOS_ALIMENTICIOS,
    "productos de limpieza": CUENTA_PRODUCTOS_LIMPIEZA,
    "servicios externos": CUENTA_SERVICIOS_EXTERNOS,
}


def _cuenta_egreso_por_categoria(categoria: str | None) -> str:
    if categoria:
        cuenta = CUENTAS_POR_CATEGORIA_EGRESO.get(categoria.strip().lower())
        if cuenta:
            return cuenta
    return CUENTA_GASTOS_ADMINISTRATIVOS

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
    en _registrar_ventas_facturadas_en_diario. Las ventas por QR sin factura
    se registran en _registrar_ventas_qr_en_diario. Las ventas por POS
    (tarjeta) sin factura quedan fuera a propósito: ese tratamiento lo sigue
    armando el contador a mano."""
    total = await pool().fetchval(
        "SELECT COALESCE(SUM(op.monto), 0) FROM orden_pagos op "
        "JOIN ordenes o ON o.id = op.orden_id "
        "WHERE o.turno_id = $1 AND o.estado = 'cobrada' AND op.tipo_pago = 'EFECTIVO'",
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


async def _registrar_ventas_qr_en_diario(turno_id: int) -> None:
    """Al cerrar un turno, asienta en el Libro Diario el total de ventas por
    QR SIN factura de ese turno (Debe Banco, Haber Ventas). QR/FAC no pasa
    por aquí: se registra en _registrar_ventas_facturadas_en_diario."""
    total = await pool().fetchval(
        "SELECT COALESCE(SUM(op.monto), 0) FROM orden_pagos op "
        "JOIN ordenes o ON o.id = op.orden_id "
        "WHERE o.turno_id = $1 AND o.estado = 'cobrada' AND op.tipo_pago = 'QR'",
        turno_id,
    )
    if not total or total <= 0:
        return

    turno = await pool().fetchrow("SELECT responsable FROM turnos WHERE id = $1", turno_id)
    glosa = f"Ventas por QR del turno de {turno['responsable']} (cierre de caja, turno #{turno_id})."
    fecha = hoy_bolivia()

    async with pool().acquire() as conn:
        async with conn.transaction():
            siguiente = await conn.fetchval("SELECT COALESCE(MAX(nro_asiento), 0) + 1 FROM libro_diario")
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, $4, 0, $5)",
                fecha, siguiente, CUENTA_BANCO, float(total), glosa,
            )
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, 0, $4, $5)",
                fecha, siguiente, CUENTA_VENTAS, float(total), glosa,
            )


async def _registrar_egreso_en_diario(monto: float, tipo_pago: str, categoria: str | None, motivo: str, responsable: str) -> None:
    """Asienta un egreso de caja en el Libro Diario apenas se registra (no se
    espera al cierre de turno, porque el dinero sale de inmediato). Se debita
    la cuenta propia de la categoría cuando existe (ver
    CUENTAS_POR_CATEGORIA_EGRESO); si la categoría todavía no tiene cuenta
    asignada, se usa Gastos Administrativos. Solo se asienta para EFECTIVO y
    QR (mismo criterio que las ventas): un egreso por POS/otro medio no tiene
    contrapartida de caja/banco automática todavía."""
    if tipo_pago == "EFECTIVO":
        cuenta_contrapartida = CUENTA_CAJA_EFECTIVO
    elif tipo_pago == "QR":
        cuenta_contrapartida = CUENTA_BANCO
    else:
        return

    cuenta_debito = _cuenta_egreso_por_categoria(categoria)
    glosa = f"Egreso de caja — {categoria + ': ' if categoria else ''}{motivo} (responsable: {responsable})."
    fecha = hoy_bolivia()
    async with pool().acquire() as conn:
        async with conn.transaction():
            siguiente = await conn.fetchval("SELECT COALESCE(MAX(nro_asiento), 0) + 1 FROM libro_diario")
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, $4, 0, $5)",
                fecha, siguiente, cuenta_debito, monto, glosa,
            )
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, 0, $4, $5)",
                fecha, siguiente, cuenta_contrapartida, monto, glosa,
            )


async def _registrar_ingreso_caja_en_diario(monto: float, tipo_pago: str, motivo: str, responsable: str) -> None:
    """Asienta un ingreso a caja en el Libro Diario apenas se registra: es un
    traslado interno (Debe Caja Chica) desde donde salió la plata (Haber Caja
    Moneda Nacional si fue en efectivo, Banco Bisa si fue por QR). Solo se
    asienta para EFECTIVO y QR, mismo criterio que egresos y ventas."""
    if tipo_pago == "EFECTIVO":
        cuenta_origen = CUENTA_CAJA_EFECTIVO
    elif tipo_pago == "QR":
        cuenta_origen = CUENTA_BANCO
    else:
        return

    glosa = f"Ingreso a caja chica — {motivo} (responsable: {responsable})."
    fecha = hoy_bolivia()
    async with pool().acquire() as conn:
        async with conn.transaction():
            siguiente = await conn.fetchval("SELECT COALESCE(MAX(nro_asiento), 0) + 1 FROM libro_diario")
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, $4, 0, $5)",
                fecha, siguiente, CUENTA_CAJA_CHICA, monto, glosa,
            )
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, 0, $4, $5)",
                fecha, siguiente, cuenta_origen, monto, glosa,
            )


async def _registrar_ventas_facturadas_en_diario(turno_id: int) -> None:
    """Al cerrar un turno, asienta las ventas con factura (EFEC/FAC, QR/FAC y
    POS/FAC) desglosando IT (3%) e IVA (13%) sobre el total, igual que se
    calculaba a mano en el Excel. Las ventas QR/FAC pasan primero por
    Linkser, que cobra una comisión (1.8%) antes de depositar. Las ventas
    QR/POS sin factura siguen sin tocarse: ese tratamiento lo sigue armando
    el contador."""
    filas = await pool().fetch(
        "SELECT op.tipo_pago, COALESCE(SUM(op.monto), 0) AS total FROM orden_pagos op "
        "JOIN ordenes o ON o.id = op.orden_id "
        "WHERE o.turno_id = $1 AND o.estado = 'cobrada' AND op.tipo_pago = ANY($2::text[]) "
        "GROUP BY op.tipo_pago",
        turno_id,
        ["EFEC/FAC", "QR/FAC", "POS/FAC"],
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
                siguiente += 1

            if "POS/FAC" in totales:
                total = totales["POS/FAC"]
                it = round(total * TASA_IT, 2)
                iva = round(total * TASA_IVA, 2)
                venta_neta = round(total - iva, 2)
                glosa = f"Ventas POS con factura del turno de {turno['responsable']} (turno #{turno_id})."
                await linea(siguiente, CUENTA_BANCO, total, 0, glosa)
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


async def _productos_por_categoria() -> dict[str, list]:
    productos = await pool().fetch("SELECT id, nombre, categoria, precio_venta FROM productos ORDER BY categoria, nombre")
    por_categoria: dict[str, list] = {}
    for p in productos:
        por_categoria.setdefault(p["categoria"], []).append(p)
    return por_categoria


async def _resolver_items_pedido(
    cart_producto_id: list[str], cart_cantidad: list[str], cart_nota: list[str] | None = None
) -> tuple[list[dict], str | None]:
    """Arma el carrito a partir de los ids/cantidades enviados. Los ítems con
    precio negativo (p. ej. "DESCUENTO BS") son descuentos: cada uno necesita
    un justificativo (cart_nota) y no se combinan entre sí aunque compartan
    producto, para no mezclar justificativos distintos."""
    cart_nota = cart_nota or []
    productos_map = {p["id"]: p for p in await pool().fetch("SELECT id, nombre, precio_venta FROM productos")}
    cart: dict[tuple, dict] = {}
    for i, (pid_txt, cant_txt) in enumerate(zip(cart_producto_id, cart_cantidad)):
        try:
            pid = int(pid_txt)
            cantidad = float(cant_txt)
        except ValueError:
            continue
        producto = productos_map.get(pid)
        if not producto or cantidad <= 0:
            continue
        precio = float(producto["precio_venta"])
        nota = cart_nota[i].strip() if i < len(cart_nota) else ""
        if precio < 0 and not nota:
            return [], "Todo descuento debe indicar un justificativo."
        nombre = f"{producto['nombre']}: {nota}" if nota else producto["nombre"]
        key = (pid, nota)
        if key in cart:
            cart[key]["cantidad"] += cantidad
        else:
            cart[key] = {
                "producto_id": pid,
                "producto_nombre": nombre,
                "cantidad": cantidad,
                "precio_unitario": precio,
            }
    return list(cart.values()), None


def _resolver_pagos(
    tipo_pago: str, monto_pagado: str, tipo_pago2: str, monto_pagado2: str, total: float
) -> tuple[str, float | None, list[tuple[str, float]], str | None]:
    """Valida el/los método(s) de pago de un cobro. Si se indica un segundo
    método, exige que sea distinto del primero y que los dos montos sumen
    exactamente el total; en ese caso el pago queda marcado como "MIXTO" y
    se reparte en dos líneas en orden_pagos."""
    tipo_pago = tipo_pago.strip()
    tipo_pago2 = tipo_pago2.strip()

    if not tipo_pago2:
        if tipo_pago not in TIPOS_PAGO:
            return tipo_pago, None, [], "Elige un método de pago válido."
        return tipo_pago, (round(float(monto_pagado), 2) if monto_pagado else None), [(tipo_pago, round(total, 2))], None

    if tipo_pago not in TIPOS_PAGO or tipo_pago2 not in TIPOS_PAGO:
        return tipo_pago, None, [], "Elige métodos de pago válidos para dividir el cobro."
    if tipo_pago2 == tipo_pago:
        return tipo_pago, None, [], "Para dividir el pago, elige dos métodos distintos."
    try:
        monto1 = round(float(monto_pagado), 2) if monto_pagado else 0.0
        monto2 = round(float(monto_pagado2), 2) if monto_pagado2 else 0.0
    except ValueError:
        return tipo_pago, None, [], "Ingresa montos válidos para el pago dividido."
    if monto1 <= 0 or monto2 <= 0:
        return tipo_pago, None, [], "Ambos montos del pago dividido deben ser mayores a 0."
    if round(monto1 + monto2, 2) != round(total, 2):
        return (
            tipo_pago,
            None,
            [],
            f"La suma de los dos montos (Bs {monto1 + monto2:.2f}) debe ser igual al total (Bs {total:.2f}).",
        )
    return "MIXTO", round(total, 2), [(tipo_pago, monto1), (tipo_pago2, monto2)], None


async def _ventas_context(
    session: dict,
    cobrar_id: int | None = None,
    descuento_id: int | None = None,
    metodo_pago_id: int | None = None,
    editar_egreso_id: int | None = None,
    editar_ingreso_id: int | None = None,
    error: str | None = None,
    mesa_seleccionada: str | None = None,
) -> dict:
    turno = await pool().fetchrow(
        "SELECT id, responsable, monto_inicial, abierto_en FROM turnos WHERE estado = 'abierto'"
    )
    turno_anterior = await pool().fetchrow(
        "SELECT responsable, abierto_en FROM turnos ORDER BY abierto_en DESC LIMIT 1"
    )
    categorias_egreso = await pool().fetch("SELECT nombre FROM categorias_egreso_referencia ORDER BY nombre")
    mesas = await pool().fetch("SELECT id, nombre FROM mesas_referencia ORDER BY nombre")
    productos = await pool().fetch(
        "SELECT id, nombre, categoria, precio_venta FROM productos ORDER BY categoria, nombre"
    )

    ordenes_abiertas, ordenes_cobradas, egresos_efectivo, egresos_totales = [], [], 0.0, 0.0
    items_por_orden: dict[int, list] = {}
    pagos_por_orden: dict[int, list] = {}
    ingresos_efectivo = 0.0
    egresos_lista: list = []
    ingresos_lista: list = []
    ingresos_caja_totales = 0.0
    ingresos_caja_efectivo = 0.0
    if turno:
        ordenes_abiertas = await pool().fetch(
            "SELECT id, mesa, total, responsable, creado_en FROM ordenes "
            "WHERE turno_id = $1 AND estado = 'abierta' ORDER BY creado_en DESC",
            turno["id"],
        )
        ordenes_cobradas = await pool().fetch(
            "SELECT id, mesa, total, tipo_pago, responsable, cobrado_en, "
            "factura_nit, factura_celular, factura_nombre FROM ordenes "
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

            pago_rows = await pool().fetch(
                "SELECT orden_id, tipo_pago, monto FROM orden_pagos WHERE orden_id = ANY($1::int[]) ORDER BY id",
                [o["id"] for o in ordenes_cobradas],
            )
            for r in pago_rows:
                pagos_por_orden.setdefault(r["orden_id"], []).append(r)
            ingresos_efectivo = sum(
                float(r["monto"]) for r in pago_rows if r["tipo_pago"] in PAGOS_EFECTIVO
            )
        movimientos = await pool().fetch(
            "SELECT id, tipo, monto, tipo_pago, motivo, categoria, responsable, creado_en FROM movimientos_caja "
            "WHERE turno_id = $1 ORDER BY creado_en DESC",
            turno["id"],
        )
        egresos_lista = [m for m in movimientos if m["tipo"] == "egreso"]
        ingresos_lista = [m for m in movimientos if m["tipo"] == "ingreso"]
        egresos_totales = sum(float(m["monto"]) for m in egresos_lista)
        egresos_efectivo = sum(float(m["monto"]) for m in egresos_lista if m["tipo_pago"] in PAGOS_EFECTIVO)
        ingresos_caja_totales = sum(float(m["monto"]) for m in ingresos_lista)
        ingresos_caja_efectivo = sum(float(m["monto"]) for m in ingresos_lista if m["tipo_pago"] in PAGOS_EFECTIVO)

    ventas_totales = sum(float(o["total"]) for o in ordenes_cobradas)

    por_categoria: dict[str, list] = {}
    for p in productos:
        por_categoria.setdefault(p["categoria"], []).append(p)

    descuentos_por_orden = {oid: _calcular_descuento(items) for oid, items in items_por_orden.items()}

    resumen_pagos: dict[str, dict] = {t: {"cantidad": 0, "monto": 0.0} for t in TIPOS_PAGO}
    for oid, pagos in pagos_por_orden.items():
        for p in pagos:
            tipo = p["tipo_pago"] or "—"
            fila = resumen_pagos.setdefault(tipo, {"cantidad": 0, "monto": 0.0})
            fila["cantidad"] += 1
            fila["monto"] += float(p["monto"])
    resumen_pagos = {t: v for t, v in resumen_pagos.items() if v["cantidad"] > 0}

    resumen_ingresos_caja: dict[str, dict] = {}
    for m in ingresos_lista:
        tipo = m["tipo_pago"] or "—"
        fila = resumen_ingresos_caja.setdefault(tipo, {"cantidad": 0, "monto": 0.0})
        fila["cantidad"] += 1
        fila["monto"] += float(m["monto"])

    return {
        "session": session,
        "active": "ventas",
        "turno": turno,
        "turno_anterior": turno_anterior,
        "categorias_egreso": categorias_egreso,
        "mesas": mesas,
        "mesa_seleccionada": mesa_seleccionada,
        "productos": productos,
        "por_categoria": por_categoria,
        "ordenes_abiertas": ordenes_abiertas,
        "ordenes_cobradas": ordenes_cobradas,
        "items_por_orden": items_por_orden,
        "pagos_por_orden": pagos_por_orden,
        "descuentos_por_orden": descuentos_por_orden,
        "egresos_lista": egresos_lista,
        "ingresos_lista": ingresos_lista,
        "ingresos_efectivo": ingresos_efectivo,
        "egresos_efectivo": egresos_efectivo,
        "egresos_totales": egresos_totales,
        "ingresos_caja_totales": ingresos_caja_totales,
        "ventas_totales": ventas_totales,
        "resumen_pagos": resumen_pagos,
        "resumen_ingresos_caja": resumen_ingresos_caja,
        "efectivo_teorico": (
            float(turno["monto_inicial"]) + ingresos_efectivo - ingresos_caja_efectivo - egresos_efectivo
        ) if turno else 0,
        "cobrar_id": cobrar_id,
        "descuento_id": descuento_id,
        "metodo_pago_id": metodo_pago_id,
        "editar_egreso_id": editar_egreso_id,
        "editar_ingreso_id": editar_ingreso_id,
        "tipos_pago": TIPOS_PAGO,
        "denominaciones": DENOMINACIONES,
        "error": error,
    }


@router.get("", response_class=HTMLResponse)
async def ventas_page(
    request: Request,
    session: dict = Depends(require_session),
    cobrar: int | None = None,
    descuento: int | None = None,
    metodo_pago: int | None = None,
    editar_egreso: int | None = None,
    editar_ingreso: int | None = None,
):
    ctx = await _ventas_context(
        session, cobrar_id=cobrar, descuento_id=descuento, metodo_pago_id=metodo_pago,
        editar_egreso_id=editar_egreso, editar_ingreso_id=editar_ingreso,
    )
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
    tipo_pago2: str = Form(""),
    monto_pagado2: str = Form(""),
    factura_nit: str = Form(""),
    factura_celular: str = Form(""),
    factura_nombre: str = Form(""),
    observacion: str = Form(""),
    cart_producto_id: list[str] = Form([]),
    cart_cantidad: list[str] = Form([]),
    cart_nota: list[str] = Form([]),
):
    mesa = mesa.strip()
    cart, cart_error = await _resolver_items_pedido(cart_producto_id, cart_cantidad, cart_nota)
    cobrando = accion == "cobrar"
    total = sum(it["cantidad"] * it["precio_unitario"] for it in cart)

    error = None
    pagos: list[tuple[str, float]] = []
    tipo_pago_final = None
    monto_pagado_final = None
    if not turno_id:
        error = "No hay un turno abierto."
    elif not mesa:
        error = "Indica la mesa o referencia del pedido."
    elif cart_error:
        error = cart_error
    elif not cart:
        error = "Agrega al menos un producto."
    elif cobrando:
        tipo_pago_final, monto_pagado_final, pagos, error = _resolver_pagos(
            tipo_pago, monto_pagado, tipo_pago2, monto_pagado2, total
        )
        if not error and any(t in TIPOS_FACTURADOS for t, _ in pagos):
            if not factura_nit.strip() or not factura_celular.strip() or not factura_nombre.strip():
                error = "Para facturar, completa NIT, celular y nombre."

    if error:
        ctx = await _ventas_context(session, error=error, mesa_seleccionada=mesa)
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    ahora = datetime.now(timezone.utc) if cobrando else None

    async with pool().acquire() as conn:
        async with conn.transaction():
            orden_id = await conn.fetchval(
                """
                INSERT INTO ordenes (turno_id, mesa, estado, tipo_pago, monto_pagado, responsable, observacion,
                                      total, cobrado_en, factura_nit, factura_celular, factura_nombre)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id
                """,
                int(turno_id),
                mesa,
                "cobrada" if cobrando else "abierta",
                tipo_pago_final,
                monto_pagado_final,
                session["nombre"],
                observacion.strip() or None,
                total,
                ahora,
                factura_nit.strip() or None,
                factura_celular.strip() or None,
                factura_nombre.strip() or None,
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
            for pago_tipo, pago_monto in pagos:
                await conn.execute(
                    "INSERT INTO orden_pagos (orden_id, tipo_pago, monto) VALUES ($1, $2, $3)",
                    orden_id, pago_tipo, pago_monto,
                )

    accion_texto = "Cobró venta" if cobrando else "Creó pedido"
    detalle_pago = " + ".join(f"{t} Bs {m:.2f}" for t, m in pagos) if cobrando else ""
    detalle = f"Mesa {mesa}, total Bs {total:.2f}" + (f", {detalle_pago}" if cobrando else "")
    await bitacora.registrar(session, accion_texto, detalle)

    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/ordenes/{orden_id}/cobrar")
async def cobrar_orden_pendiente(
    request: Request,
    orden_id: int,
    session: dict = Depends(require_session),
    tipo_pago: str = Form(""),
    monto_pagado: str = Form(""),
    tipo_pago2: str = Form(""),
    monto_pagado2: str = Form(""),
    factura_nit: str = Form(""),
    factura_celular: str = Form(""),
    factura_nombre: str = Form(""),
):
    orden = await pool().fetchrow("SELECT total FROM ordenes WHERE id = $1 AND estado = 'abierta'", orden_id)
    if not orden:
        return RedirectResponse("/dashboard/ventas", status_code=303)

    tipo_pago_final, monto_pagado_final, pagos, error = _resolver_pagos(
        tipo_pago, monto_pagado, tipo_pago2, monto_pagado2, float(orden["total"])
    )
    if not error and any(t in TIPOS_FACTURADOS for t, _ in pagos):
        if not factura_nit.strip() or not factura_celular.strip() or not factura_nombre.strip():
            error = "Para facturar, completa NIT, celular y nombre."
    if error:
        ctx = await _ventas_context(session, error=error)
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE ordenes SET estado = 'cobrada', tipo_pago = $1, monto_pagado = $2, cobrado_en = now(), "
                "factura_nit = $3, factura_celular = $4, factura_nombre = $5 "
                "WHERE id = $6 AND estado = 'abierta'",
                tipo_pago_final,
                monto_pagado_final,
                factura_nit.strip() or None,
                factura_celular.strip() or None,
                factura_nombre.strip() or None,
                orden_id,
            )
            for pago_tipo, pago_monto in pagos:
                await conn.execute(
                    "INSERT INTO orden_pagos (orden_id, tipo_pago, monto) VALUES ($1, $2, $3)",
                    orden_id, pago_tipo, pago_monto,
                )

    detalle_pago = " + ".join(f"{t} Bs {m:.2f}" for t, m in pagos)
    await bitacora.registrar(session, "Cobró venta pendiente", f"Orden #{orden_id}, {detalle_pago}")
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/ordenes/{orden_id}/descuento")
async def aplicar_descuento_orden(
    request: Request,
    orden_id: int,
    session: dict = Depends(require_session),
    monto_descuento: str = Form(""),
    justificativo: str = Form(""),
):
    orden = await pool().fetchrow("SELECT total, mesa FROM ordenes WHERE id = $1", orden_id)
    justificativo = justificativo.strip()
    error = None
    total_actual = float(orden["total"]) if orden else 0.0
    if not orden:
        error = "No se encontró esa venta."
    elif not justificativo:
        error = "Indica el justificativo del descuento."
    else:
        try:
            monto_num = round(float(monto_descuento), 2)
        except ValueError:
            monto_num = -1
        if monto_num <= 0 or monto_num > total_actual:
            error = "La cantidad a descontar debe ser mayor a 0 y no puede superar el total actual."

    if error:
        ctx = await _ventas_context(session, error=error)
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    nuevo_precio_num = round(total_actual - monto_num, 2)
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO orden_items (orden_id, producto_id, producto_nombre, cantidad, precio_unitario)
                VALUES ($1, NULL, $2, 1, $3)
                """,
                orden_id,
                f"Descuento: {justificativo}",
                -monto_num,
            )
            await conn.execute("UPDATE ordenes SET total = $1 WHERE id = $2", nuevo_precio_num, orden_id)

    await bitacora.registrar(
        session,
        "Aplicó descuento a venta",
        f"Orden #{orden_id} (mesa {orden['mesa']}): Bs {total_actual:.2f} → Bs {nuevo_precio_num:.2f} "
        f"(-Bs {monto_num:.2f}), motivo: {justificativo}",
    )
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/ordenes/{orden_id}/metodo-pago")
async def cambiar_metodo_pago_orden(
    request: Request,
    orden_id: int,
    session: dict = Depends(require_session),
    tipo_pago: str = Form(""),
    factura_nit: str = Form(""),
    factura_celular: str = Form(""),
    factura_nombre: str = Form(""),
):
    tipo_pago = tipo_pago.strip()
    factura_nit = factura_nit.strip()
    factura_celular = factura_celular.strip()
    factura_nombre = factura_nombre.strip()

    orden = await pool().fetchrow(
        "SELECT o.total, o.mesa, t.estado AS turno_estado FROM ordenes o "
        "JOIN turnos t ON t.id = o.turno_id WHERE o.id = $1 AND o.estado = 'cobrada'",
        orden_id,
    )
    error = None
    if not orden:
        error = "No se encontró esa venta."
    elif orden["turno_estado"] != "abierto":
        error = "Ya no se puede cambiar el método de pago: el turno de esta venta ya está cerrado."
    elif tipo_pago not in TIPOS_PAGO:
        error = "Elige un método de pago válido."
    elif tipo_pago in TIPOS_FACTURADOS and not (factura_nit and factura_celular and factura_nombre):
        error = "Para facturar, completa NIT, celular y nombre."

    if error:
        ctx = await _ventas_context(session, error=error)
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "UPDATE ordenes SET tipo_pago = $1, factura_nit = $2, factura_celular = $3, factura_nombre = $4 "
                "WHERE id = $5",
                tipo_pago,
                factura_nit or None,
                factura_celular or None,
                factura_nombre or None,
                orden_id,
            )
            await conn.execute("DELETE FROM orden_pagos WHERE orden_id = $1", orden_id)
            await conn.execute(
                "INSERT INTO orden_pagos (orden_id, tipo_pago, monto) VALUES ($1, $2, $3)",
                orden_id, tipo_pago, orden["total"],
            )

    detalle = f"Orden #{orden_id} (mesa {orden['mesa']}) → {tipo_pago}"
    if tipo_pago in TIPOS_FACTURADOS:
        detalle += f", factura a nombre de {factura_nombre} (NIT {factura_nit})"
    await bitacora.registrar(session, "Cambió método de pago de venta", detalle)
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.get("/ordenes/{orden_id}/items", response_class=HTMLResponse)
async def editar_items_orden_form(request: Request, orden_id: int, session: dict = Depends(require_session)):
    orden = await pool().fetchrow(
        "SELECT id, mesa, estado, total, tipo_pago, responsable, creado_en, cobrado_en FROM ordenes WHERE id = $1",
        orden_id,
    )
    if not orden or orden["estado"] not in ("abierta", "cobrada"):
        return RedirectResponse("/dashboard/ventas", status_code=303)

    items = await pool().fetch(
        "SELECT producto_nombre, cantidad, precio_unitario FROM orden_items WHERE orden_id = $1 ORDER BY id",
        orden_id,
    )
    por_categoria = await _productos_por_categoria()

    return templates.TemplateResponse(
        request,
        "dashboard/orden_items.html",
        {
            "session": session,
            "active": "ventas",
            "orden": orden,
            "items": items,
            "por_categoria": por_categoria,
        },
    )


@router.post("/ordenes/{orden_id}/items")
async def editar_items_orden(
    orden_id: int,
    session: dict = Depends(require_session),
    cart_producto_id: list[str] = Form([]),
    cart_cantidad: list[str] = Form([]),
    cart_nota: list[str] = Form([]),
):
    orden = await pool().fetchrow("SELECT total, mesa, estado FROM ordenes WHERE id = $1", orden_id)
    if not orden or orden["estado"] not in ("abierta", "cobrada"):
        return RedirectResponse("/dashboard/ventas", status_code=303)

    cart, cart_error = await _resolver_items_pedido(cart_producto_id, cart_cantidad, cart_nota)
    if cart_error or not cart:
        return RedirectResponse(f"/dashboard/ventas/ordenes/{orden_id}/items", status_code=303)

    agregado = sum(it["cantidad"] * it["precio_unitario"] for it in cart)
    async with pool().acquire() as conn:
        async with conn.transaction():
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
            await conn.execute(
                "UPDATE ordenes SET total = total + $1 WHERE id = $2", agregado, orden_id
            )

    detalle_items = ", ".join(f"{it['cantidad']:g}x {it['producto_nombre']}" for it in cart)
    await bitacora.registrar(
        session,
        "Agregó productos a un pedido",
        f"Orden #{orden_id} (mesa {orden['mesa']}): +Bs {agregado:.2f} ({detalle_items})",
    )
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
        "SELECT id, mesa, total, tipo_pago, responsable, creado_en, cobrado_en, "
        "factura_nit, factura_celular, factura_nombre FROM ordenes WHERE id = $1",
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
    request: Request, turno_id: int, session: dict = Depends(require_admin), monto_inicial: str = Form("")
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
        await _registrar_ventas_qr_en_diario(turno_id)
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
    categoria: str = Form(""),
):
    motivo = motivo.strip()
    tipo_pago = tipo_pago.strip()
    categoria = categoria.strip()
    try:
        monto_num = float(monto)
    except ValueError:
        monto_num = 0

    if not turno_id or monto_num <= 0 or not motivo or tipo_pago not in TIPOS_PAGO or not categoria:
        ctx = await _ventas_context(session, error="Completa categoría, motivo, método de pago y monto (mayor a 0).")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    await pool().execute(
        "INSERT INTO movimientos_caja (turno_id, tipo, monto, motivo, responsable, tipo_pago, categoria) "
        "VALUES ($1, 'egreso', $2, $3, $4, $5, $6)",
        int(turno_id),
        monto_num,
        motivo,
        session["nombre"],
        tipo_pago,
        categoria,
    )
    await _registrar_egreso_en_diario(monto_num, tipo_pago, categoria, motivo, session["nombre"])
    await bitacora.registrar(session, "Registró egreso de caja", f"{categoria} — Bs {monto_num:.2f} — {motivo}")
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/movimientos/ingreso", response_class=HTMLResponse)
async def registrar_ingreso_caja(
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
        ctx = await _ventas_context(session, error="Completa motivo, método de pago y monto (mayor a 0) para el ingreso.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    await pool().execute(
        "INSERT INTO movimientos_caja (turno_id, tipo, monto, motivo, responsable, tipo_pago) "
        "VALUES ($1, 'ingreso', $2, $3, $4, $5)",
        int(turno_id),
        monto_num,
        motivo,
        session["nombre"],
        tipo_pago,
    )
    await _registrar_ingreso_caja_en_diario(monto_num, tipo_pago, motivo, session["nombre"])
    await bitacora.registrar(session, "Registró ingreso a caja", f"Bs {monto_num:.2f} — {motivo} ({tipo_pago})")
    return RedirectResponse("/dashboard/ventas#ingresos-turno", status_code=303)


@router.post("/movimientos/{movimiento_id}/editar-ingreso", response_class=HTMLResponse)
async def editar_ingreso_caja(
    request: Request,
    movimiento_id: int,
    session: dict = Depends(require_session),
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

    if monto_num <= 0 or not motivo or tipo_pago not in TIPOS_PAGO:
        ctx = await _ventas_context(session, error="Completa motivo, método de pago y monto (mayor a 0) para el ingreso.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    await pool().execute(
        "UPDATE movimientos_caja SET monto = $1, motivo = $2, tipo_pago = $3 WHERE id = $4",
        monto_num, motivo, tipo_pago, movimiento_id,
    )
    await bitacora.registrar(
        session, "Editó ingreso a caja",
        f"Movimiento #{movimiento_id}: Bs {monto_num:.2f} — {motivo} ({tipo_pago}) "
        f"(si ya estaba contabilizado en el Libro Diario, el asiento original no se ajusta solo — revísalo a mano).",
    )
    return RedirectResponse("/dashboard/ventas#ingresos-turno", status_code=303)


@router.post("/movimientos/categorias", response_class=HTMLResponse)
async def agregar_categoria_egreso(
    request: Request, session: dict = Depends(require_session), nombre_nueva: str = Form("")
):
    nombre_nueva = nombre_nueva.strip()
    if nombre_nueva:
        await pool().execute(
            "INSERT INTO categorias_egreso_referencia (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING",
            nombre_nueva,
        )
    categorias = await pool().fetch("SELECT nombre FROM categorias_egreso_referencia ORDER BY nombre")
    return templates.TemplateResponse(
        request, "partials/_categoria_egreso_select.html",
        {"categorias_egreso": categorias, "categoria_seleccionada": nombre_nueva},
    )


@router.post("/movimientos/{movimiento_id}/editar", response_class=HTMLResponse)
async def editar_movimiento_caja(
    request: Request,
    movimiento_id: int,
    session: dict = Depends(require_session),
    monto: str = Form(""),
    motivo: str = Form(""),
    tipo_pago: str = Form(""),
    categoria: str = Form(""),
):
    motivo = motivo.strip()
    tipo_pago = tipo_pago.strip()
    categoria = categoria.strip()
    try:
        monto_num = float(monto)
    except ValueError:
        monto_num = 0

    if monto_num <= 0 or not motivo or tipo_pago not in TIPOS_PAGO or not categoria:
        ctx = await _ventas_context(session, error="Completa categoría, motivo, método de pago y monto (mayor a 0).")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    await pool().execute(
        "UPDATE movimientos_caja SET monto = $1, motivo = $2, tipo_pago = $3, categoria = $4 WHERE id = $5",
        monto_num,
        motivo,
        tipo_pago,
        categoria,
        movimiento_id,
    )
    await bitacora.registrar(
        session, "Editó egreso de caja",
        f"Movimiento #{movimiento_id}: {categoria} — Bs {monto_num:.2f} — {motivo} "
        f"(si ya estaba contabilizado en el Libro Diario, el asiento original no se ajusta solo — revísalo a mano).",
    )
    return RedirectResponse("/dashboard/ventas", status_code=303)


@router.post("/movimientos/{movimiento_id}/eliminar")
async def eliminar_movimiento_caja(movimiento_id: int, session: dict = Depends(require_session)):
    movimiento = await pool().fetchrow("SELECT tipo, motivo, monto FROM movimientos_caja WHERE id = $1", movimiento_id)
    if movimiento:
        await pool().execute("DELETE FROM movimientos_caja WHERE id = $1", movimiento_id)
        accion = "Eliminó ingreso a caja" if movimiento["tipo"] == "ingreso" else "Eliminó egreso de caja"
        await bitacora.registrar(
            session, accion, f"Movimiento #{movimiento_id}, Bs {movimiento['monto']:.2f} — {movimiento['motivo']}"
        )
    return RedirectResponse("/dashboard/ventas", status_code=303)
