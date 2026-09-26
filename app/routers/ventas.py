from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_admin, require_session
from app.templating import templates
from app.tz import BOLIVIA_TZ, hoy_bolivia

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


def _parse_hora_local(valor: str) -> datetime | None:
    """Convierte el valor de un <input type="datetime-local"> (hora de
    Bolivia, sin zona) a un datetime consciente de zona horaria, para poder
    corregir a mano el creado_en/cobrado_en de una venta o un movimiento de
    caja. Devuelve None si viene vacío o mal formado, para no pisar la hora
    existente por error."""
    valor = (valor or "").strip()
    if not valor:
        return None
    try:
        return datetime.strptime(valor, "%Y-%m-%dT%H:%M").replace(tzinfo=BOLIVIA_TZ)
    except ValueError:
        return None


def _cuenta_egreso_por_categoria(categoria: str | None) -> str:
    if categoria:
        cuenta = CUENTAS_POR_CATEGORIA_EGRESO.get(categoria.strip().lower())
        if cuenta:
            return cuenta
    return CUENTA_GASTOS_ADMINISTRATIVOS


MESA_GRID_COLUMNAS = 4

# Nombres del plano que son zonas/referencias del local, no mesas donde se
# pueda tomar un pedido (p. ej. "BARRA" o "PASILLO" son solo etiquetas de
# ubicación). Se muestran como texto estático en vez de un botón seleccionable.
MESAS_ETIQUETA = {"EXTERIOR", "BARRA", "PASILLO"}


def _mesas_con_layout(mesas) -> list[dict]:
    """Las mesas con posición fija (fila/columna ya cargados en
    mesas_referencia) se ubican tal cual, replicando el plano físico del
    local. Las que todavía no tienen posición (p. ej. una agregada a mano con
    "+ Agregar") se acomodan solas en filas nuevas debajo de esas, para no
    invadir huecos del plano ya armado."""
    posicionadas = [dict(m) for m in mesas if m["fila"] is not None]
    sin_posicion = [dict(m) for m in mesas if m["fila"] is None]
    fila_libre = max((m["fila"] + m["alto"] for m in posicionadas), default=1)
    for i, m in enumerate(sin_posicion):
        m["fila"] = fila_libre + i // MESA_GRID_COLUMNAS
        m["columna"] = (i % MESA_GRID_COLUMNAS) + 1
        m["ancho"] = 1
        m["alto"] = 1
    resultado = posicionadas + sin_posicion
    for m in resultado:
        m["es_mesa"] = m["nombre"] not in MESAS_ETIQUETA
    return resultado


def _mesas_ocupadas_info(ordenes_abiertas) -> tuple[dict[str, str], dict[str, int]]:
    """Para cada mesa con una cuenta abierta: desde cuándo está así (la más
    antigua de sus órdenes pendientes, para que el contador del plano arranque
    desde que empezó a esperar el cobro) y el id de esa orden, para poder
    abrirla directamente al hacer clic en la mesa desde el plano."""
    desde: dict[str, datetime] = {}
    orden_id: dict[str, int] = {}
    for o in ordenes_abiertas:
        actual = desde.get(o["mesa"])
        if actual is None or o["creado_en"] < actual:
            desde[o["mesa"]] = o["creado_en"]
            orden_id[o["mesa"]] = o["id"]
    return {mesa: dt.isoformat() for mesa, dt in desde.items()}, orden_id


def _grid_dimensiones(mesas: list[dict]) -> tuple[int, int]:
    """Tamaño de la grilla (filas x columnas) que hay que reservar para que,
    en modo edición, sobren casilleros vacíos donde soltar mesas nuevas."""
    max_fila = max((m["fila"] + m["alto"] - 1 for m in mesas), default=1)
    max_columna = max((m["columna"] + m["ancho"] - 1 for m in mesas), default=MESA_GRID_COLUMNAS)
    return max_fila + 2, max(max_columna, MESA_GRID_COLUMNAS)


async def _efectivo_teorico_turno(turno_id: int, monto_inicial) -> float:
    """Recalcula el efectivo teórico de un turno (abierto o ya cerrado) a
    partir de sus ventas y movimientos de caja, con la misma fórmula que usa
    _ventas_context para el turno abierto actual. Sirve para comparar contra
    el arqueo contado tanto al momento de cerrar como después, desde Control
    de Turnos."""
    ingresos_efectivo = await pool().fetchval(
        "SELECT COALESCE(SUM(op.monto), 0) FROM orden_pagos op "
        "JOIN ordenes o ON o.id = op.orden_id "
        "WHERE o.turno_id = $1 AND o.estado = 'cobrada' AND op.tipo_pago = ANY($2::text[])",
        turno_id, list(PAGOS_EFECTIVO),
    )
    egresos_efectivo = await pool().fetchval(
        "SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja "
        "WHERE turno_id = $1 AND tipo = 'egreso' AND tipo_pago = ANY($2::text[])",
        turno_id, list(PAGOS_EFECTIVO),
    )
    ingresos_caja_efectivo = await pool().fetchval(
        "SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja "
        "WHERE turno_id = $1 AND tipo = 'ingreso' AND tipo_pago = ANY($2::text[])",
        turno_id, list(PAGOS_EFECTIVO),
    )
    reposiciones = await pool().fetchval(
        "SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja WHERE turno_id = $1 AND tipo = 'reposicion'",
        turno_id,
    )
    return (
        float(monto_inicial) + float(ingresos_efectivo) + float(reposiciones)
        - float(ingresos_caja_efectivo) - float(egresos_efectivo)
    )

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


async def _registrar_reposicion_caja_en_diario(monto: float, motivo: str, responsable: str) -> None:
    """Asienta una reposición de efectivo en la Libro Diario: entra plata a
    Caja Moneda Nacional (la caja del turno actual) desde Caja Chica — el
    camino inverso de 'Registrar ingreso a caja', para darle cambio/fondo al
    cajero durante el turno. Al cerrar, esta plata también se traslada de
    vuelta a Caja Chica junto con el resto del arqueo, como siempre."""
    glosa = f"Reposición de caja desde Caja Chica — {motivo} (responsable: {responsable})."
    fecha = hoy_bolivia()
    async with pool().acquire() as conn:
        async with conn.transaction():
            siguiente = await conn.fetchval("SELECT COALESCE(MAX(nro_asiento), 0) + 1 FROM libro_diario")
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, $4, 0, $5)",
                fecha, siguiente, CUENTA_CAJA_EFECTIVO, monto, glosa,
            )
            await conn.execute(
                "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                "VALUES ($1, $2, $3, 0, $4, $5)",
                fecha, siguiente, CUENTA_CAJA_CHICA, monto, glosa,
            )


async def _registrar_traslado_arqueo_a_caja_chica_en_diario(turno_id: int, responsable: str, monto: float) -> None:
    """Al cerrar un turno se traslada a Caja Chica todo el efectivo que quedó
    contado en el arqueo — el mismo movimiento que ya hace a mano 'Registrar
    ingreso a caja' durante el turno, pero automático para lo que sobra al
    cierre, así Caja Moneda Nacional siempre vuelve a cero después de cerrar."""
    if monto <= 0:
        return
    glosa = f"Traslado a Caja Chica del arqueo de cierre del turno de {responsable} (turno #{turno_id})."
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
                fecha, siguiente, CUENTA_CAJA_EFECTIVO, monto, glosa,
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
    hora_id: int | None = None,
    editar_egreso_id: int | None = None,
    editar_ingreso_id: int | None = None,
    error: str | None = None,
    mesa_seleccionada: str | None = None,
    cierre_estado: str | None = None,
    cierre_diferencia: str | None = None,
) -> dict:
    turno = await pool().fetchrow(
        "SELECT id, responsable, monto_inicial, abierto_en FROM turnos WHERE estado = 'abierto'"
    )
    hoy = hoy_bolivia()
    inicio_dia = datetime.combine(hoy, time.min, BOLIVIA_TZ)
    fin_dia = inicio_dia + timedelta(days=1)
    turnos_hoy = await pool().fetch(
        """
        SELECT t.id, t.responsable, t.estado, t.abierto_en, t.cerrado_en, t.monto_final_declarado,
               COALESCE(v.cantidad_ventas, 0) AS cantidad_ventas,
               COALESCE(v.total_ventas, 0) AS total_ventas
        FROM turnos t
        LEFT JOIN (
            SELECT turno_id, COUNT(*) AS cantidad_ventas, SUM(total) AS total_ventas
            FROM ordenes WHERE estado = 'cobrada' GROUP BY turno_id
        ) v ON v.turno_id = t.id
        WHERE t.abierto_en >= $1 AND t.abierto_en < $2
        ORDER BY t.abierto_en
        """,
        inicio_dia, fin_dia,
    )
    # Al abrir caja se muestra qué quedó contado en el arqueo del/los
    # turno(s) anterior(es) de hoy, para poder chequear a simple vista lo
    # que debería haber en el cajón antes de empezar el turno nuevo.
    arqueo_por_turno: dict[int, list] = {}
    if turno is None and turnos_hoy:
        filas_arqueo = await pool().fetch(
            "SELECT turno_id, corte, tipo, cantidad, subtotal FROM conteo_caja "
            "WHERE turno_id = ANY($1::int[]) ORDER BY turno_id, corte DESC",
            [t["id"] for t in turnos_hoy],
        )
        for f in filas_arqueo:
            arqueo_por_turno.setdefault(f["turno_id"], []).append(f)
    categorias_egreso = await pool().fetch("SELECT nombre FROM categorias_egreso_referencia ORDER BY nombre")
    mesas = _mesas_con_layout(
        await pool().fetch("SELECT id, nombre, fila, columna, ancho, alto FROM mesas_referencia ORDER BY fila NULLS LAST, columna, nombre")
    )
    productos = await pool().fetch(
        "SELECT id, nombre, categoria, precio_venta FROM productos ORDER BY categoria, nombre"
    )

    ordenes_abiertas, ordenes_cobradas, egresos_efectivo, egresos_totales = [], [], 0.0, 0.0
    items_por_orden: dict[int, list] = {}
    pagos_por_orden: dict[int, list] = {}
    ingresos_efectivo = 0.0
    egresos_lista: list = []
    ingresos_lista: list = []
    reposiciones_lista: list = []
    ingresos_caja_totales = 0.0
    ingresos_caja_efectivo = 0.0
    reposiciones_totales = 0.0
    # Sin filtrar por turno_id: una cuenta pendiente sigue viéndose aunque el
    # turno en que se creó ya haya cerrado, hasta que se cobre o se cancele
    # (puede quedar pendiente de un turno anterior y pasar al siguiente).
    ordenes_abiertas = await pool().fetch(
        "SELECT id, mesa, total, responsable, creado_en FROM ordenes "
        "WHERE estado = 'abierta' ORDER BY creado_en DESC"
    )
    if turno:
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
        reposiciones_lista = [m for m in movimientos if m["tipo"] == "reposicion"]
        egresos_totales = sum(float(m["monto"]) for m in egresos_lista)
        egresos_efectivo = sum(float(m["monto"]) for m in egresos_lista if m["tipo_pago"] in PAGOS_EFECTIVO)
        ingresos_caja_totales = sum(float(m["monto"]) for m in ingresos_lista)
        ingresos_caja_efectivo = sum(float(m["monto"]) for m in ingresos_lista if m["tipo_pago"] in PAGOS_EFECTIVO)
        reposiciones_totales = sum(float(m["monto"]) for m in reposiciones_lista)

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

    pendientes_totales = sum(float(o["total"]) for o in ordenes_abiertas)
    mesas_ocupadas_desde, mesas_ocupadas_id = _mesas_ocupadas_info(ordenes_abiertas)

    return {
        "session": session,
        "active": "ventas",
        "turno": turno,
        "turnos_hoy": turnos_hoy,
        "arqueo_por_turno": arqueo_por_turno,
        "categorias_egreso": categorias_egreso,
        "mesas": mesas,
        "mesas_ocupadas": list(mesas_ocupadas_desde.keys()),
        "mesas_ocupadas_desde": mesas_ocupadas_desde,
        "mesas_ocupadas_id": mesas_ocupadas_id,
        "mesa_seleccionada": mesa_seleccionada,
        "modo_edicion": False,
        "productos": productos,
        "por_categoria": por_categoria,
        "ordenes_abiertas": ordenes_abiertas,
        "pendientes_totales": pendientes_totales,
        "ordenes_cobradas": ordenes_cobradas,
        "items_por_orden": items_por_orden,
        "pagos_por_orden": pagos_por_orden,
        "descuentos_por_orden": descuentos_por_orden,
        "egresos_lista": egresos_lista,
        "ingresos_lista": ingresos_lista,
        "reposiciones_lista": reposiciones_lista,
        "ingresos_efectivo": ingresos_efectivo,
        "egresos_efectivo": egresos_efectivo,
        "egresos_totales": egresos_totales,
        "ingresos_caja_totales": ingresos_caja_totales,
        "reposiciones_totales": reposiciones_totales,
        "ventas_totales": ventas_totales,
        "resumen_pagos": resumen_pagos,
        "resumen_ingresos_caja": resumen_ingresos_caja,
        "efectivo_teorico": (
            float(turno["monto_inicial"]) + ingresos_efectivo + reposiciones_totales
            - ingresos_caja_efectivo - egresos_efectivo
        ) if turno else 0,
        "cobrar_id": cobrar_id,
        "descuento_id": descuento_id,
        "metodo_pago_id": metodo_pago_id,
        "hora_id": hora_id,
        "editar_egreso_id": editar_egreso_id,
        "editar_ingreso_id": editar_ingreso_id,
        "tipos_pago": TIPOS_PAGO,
        "denominaciones": DENOMINACIONES,
        "error": error,
        "cierre_estado": cierre_estado,
        "cierre_diferencia": cierre_diferencia,
    }


@router.get("", response_class=HTMLResponse)
async def ventas_page(
    request: Request,
    session: dict = Depends(require_session),
    cobrar: int | None = None,
    descuento: int | None = None,
    metodo_pago: int | None = None,
    hora: int | None = None,
    editar_egreso: int | None = None,
    editar_ingreso: int | None = None,
    cierre_estado: str | None = None,
    cierre_diferencia: str | None = None,
):
    ctx = await _ventas_context(
        session, cobrar_id=cobrar, descuento_id=descuento, metodo_pago_id=metodo_pago, hora_id=hora,
        editar_egreso_id=editar_egreso, editar_ingreso_id=editar_ingreso,
        cierre_estado=cierre_estado, cierre_diferencia=cierre_diferencia,
    )
    return templates.TemplateResponse(request, "dashboard/ventas.html", ctx)


async def _guardar_cliente_desde_factura(nombre: str, ci_nit: str, telefono: str) -> None:
    """Cada vez que se factura una venta (NIT/celular/nombre), se aprovecha
    para ir armando la base de clientes solo. Si el NIT ya está registrado,
    no se pisa el nombre ni el teléfono que ya haya (puede haber sido
    cargado/corregido a mano) — como mucho se completa el teléfono si
    estaba vacío. Si el NIT es nuevo, se crea el cliente."""
    nombre = nombre.strip()
    ci_nit = ci_nit.strip()
    telefono = telefono.strip()
    if not nombre or not ci_nit:
        return
    existente = await pool().fetchrow("SELECT id, telefono FROM clientes WHERE ci_nit = $1", ci_nit)
    if existente:
        if not existente["telefono"] and telefono:
            await pool().execute("UPDATE clientes SET telefono = $1 WHERE id = $2", telefono, existente["id"])
        return
    await pool().execute(
        "INSERT INTO clientes (nombre, ci_nit, telefono) VALUES ($1, $2, $3)",
        nombre, ci_nit, telefono or None,
    )


async def _contexto_grid_mesas(mesa_seleccionada: str | None, modo_edicion: bool) -> dict:
    mesas = _mesas_con_layout(
        await pool().fetch("SELECT id, nombre, fila, columna, ancho, alto FROM mesas_referencia ORDER BY fila NULLS LAST, columna, nombre")
    )
    ordenes_abiertas = await pool().fetch("SELECT id, mesa, creado_en FROM ordenes WHERE estado = 'abierta'")
    grid_filas, grid_columnas = _grid_dimensiones(mesas)
    mesas_ocupadas_desde, mesas_ocupadas_id = _mesas_ocupadas_info(ordenes_abiertas)
    return {
        "mesas": mesas,
        "mesas_ocupadas": list(mesas_ocupadas_desde.keys()),
        "mesas_ocupadas_desde": mesas_ocupadas_desde,
        "mesas_ocupadas_id": mesas_ocupadas_id,
        "mesa_seleccionada": mesa_seleccionada,
        "modo_edicion": modo_edicion,
        "grid_filas": grid_filas,
        "grid_columnas": grid_columnas,
    }


@router.get("/mesas/grid", response_class=HTMLResponse)
async def grid_mesas(request: Request, session: dict = Depends(require_session), editar: bool = False, mesa: str = ""):
    contexto = await _contexto_grid_mesas(mesa or None, editar)
    return templates.TemplateResponse(request, "partials/_mesa_grid.html", contexto)


@router.post("/mesas", response_class=HTMLResponse)
async def agregar_mesa(request: Request, session: dict = Depends(require_session), nombre_nueva: str = Form("")):
    nombre_nueva = nombre_nueva.strip().upper()
    if nombre_nueva:
        await pool().execute(
            "INSERT INTO mesas_referencia (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING", nombre_nueva
        )
        await bitacora.registrar(session, "Agregó mesa/referencia", nombre_nueva)
    contexto = await _contexto_grid_mesas(nombre_nueva, True)
    return templates.TemplateResponse(request, "partials/_mesa_grid.html", contexto)


@router.post("/mesas/mover", response_class=HTMLResponse)
async def mover_mesa(
    request: Request,
    session: dict = Depends(require_session),
    nombre: str = Form(...),
    fila: int = Form(...),
    columna: int = Form(...),
):
    await pool().execute(
        "UPDATE mesas_referencia SET fila = $2, columna = $3 WHERE nombre = $1", nombre, fila, columna
    )
    contexto = await _contexto_grid_mesas(nombre, True)
    return templates.TemplateResponse(request, "partials/_mesa_grid.html", contexto)


@router.post("/mesas/eliminar", response_class=HTMLResponse)
async def eliminar_mesa(
    request: Request,
    session: dict = Depends(require_session),
    nombre: str = Form(...),
):
    ocupada = await pool().fetchval(
        "SELECT count(*) FROM ordenes WHERE mesa = $1 AND estado = 'abierta'", nombre
    )
    if not ocupada:
        await pool().execute("DELETE FROM mesas_referencia WHERE nombre = $1", nombre)
        await bitacora.registrar(session, "Eliminó mesa/referencia", nombre)
    contexto = await _contexto_grid_mesas(None, True)
    return templates.TemplateResponse(request, "partials/_mesa_grid.html", contexto)


@router.post("/mesas/intercambiar", response_class=HTMLResponse)
async def intercambiar_mesa(
    request: Request,
    session: dict = Depends(require_session),
    origen: str = Form(...),
    destino: str = Form(...),
):
    if origen != destino:
        async with pool().acquire() as conn:
            async with conn.transaction():
                a = await conn.fetchrow(
                    "SELECT fila, columna, ancho, alto FROM mesas_referencia WHERE nombre = $1", origen
                )
                b = await conn.fetchrow(
                    "SELECT fila, columna, ancho, alto FROM mesas_referencia WHERE nombre = $1", destino
                )
                if a and b:
                    await conn.execute(
                        "UPDATE mesas_referencia SET fila=$2, columna=$3, ancho=$4, alto=$5 WHERE nombre=$1",
                        origen, b["fila"], b["columna"], b["ancho"], b["alto"],
                    )
                    await conn.execute(
                        "UPDATE mesas_referencia SET fila=$2, columna=$3, ancho=$4, alto=$5 WHERE nombre=$1",
                        destino, a["fila"], a["columna"], a["ancho"], a["alto"],
                    )
    contexto = await _contexto_grid_mesas(origen, True)
    return templates.TemplateResponse(request, "partials/_mesa_grid.html", contexto)


@router.get("/ordenes/{orden_id}/carrito.json")
async def obtener_carrito_orden(orden_id: int, session: dict = Depends(require_session)):
    """Para recargar una cuenta pendiente en el panel de pedido (al hacer clic
    en su mesa desde el plano): devuelve sus ítems en la misma forma que usa
    el carrito del cliente, para poder seguir agregando o cobrar desde ahí."""
    orden = await pool().fetchrow("SELECT id, mesa FROM ordenes WHERE id = $1 AND estado = 'abierta'", orden_id)
    if not orden:
        return JSONResponse({"error": "No se encontró una cuenta pendiente con ese id."}, status_code=404)
    filas = await pool().fetch(
        "SELECT producto_id, producto_nombre, cantidad, precio_unitario FROM orden_items WHERE orden_id = $1 ORDER BY id",
        orden_id,
    )
    items = []
    for f in filas:
        nombre = f["producto_nombre"]
        precio = float(f["precio_unitario"])
        nota = ""
        # Los descuentos guardan su justificativo como "Nombre: justificativo"
        # (ver _resolver_items_pedido); hay que separarlos de nuevo para que,
        # si se vuelve a guardar el carrito, el justificativo no se pierda.
        if precio < 0 and ": " in nombre:
            nombre, _, nota = nombre.partition(": ")
        items.append({
            "id": f["producto_id"],
            "nombre": nombre,
            "precio": precio,
            "cantidad": float(f["cantidad"]),
            "nota": nota,
        })
    return {"orden_id": orden["id"], "mesa": orden["mesa"], "items": items}


@router.post("/ordenes", response_class=HTMLResponse)
async def crear_orden(
    request: Request,
    session: dict = Depends(require_session),
    turno_id: str = Form(""),
    mesa: str = Form(""),
    accion: str = Form("pendiente"),
    orden_id_existente: str = Form(""),
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

    orden_existente = None
    if orden_id_existente.strip():
        orden_existente = await pool().fetchrow(
            "SELECT id, mesa FROM ordenes WHERE id = $1 AND estado = 'abierta'", int(orden_id_existente)
        )

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
            if orden_existente:
                orden_id = orden_existente["id"]
                await conn.execute(
                    """
                    UPDATE ordenes SET mesa = $2, estado = $3, tipo_pago = $4, monto_pagado = $5,
                        observacion = $6, total = $7, cobrado_en = $8,
                        factura_nit = $9, factura_celular = $10, factura_nombre = $11
                    WHERE id = $1
                    """,
                    orden_id,
                    mesa,
                    "cobrada" if cobrando else "abierta",
                    tipo_pago_final,
                    monto_pagado_final,
                    observacion.strip() or None,
                    total,
                    ahora,
                    factura_nit.strip() or None,
                    factura_celular.strip() or None,
                    factura_nombre.strip() or None,
                )
                await conn.execute("DELETE FROM orden_items WHERE orden_id = $1", orden_id)
                await conn.execute("DELETE FROM orden_pagos WHERE orden_id = $1", orden_id)
            else:
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

    if cobrando and any(t in TIPOS_FACTURADOS for t, _ in pagos):
        await _guardar_cliente_desde_factura(factura_nombre, factura_nit, factura_celular)

    if orden_existente:
        accion_texto = "Cobró venta" if cobrando else "Actualizó cuenta pendiente"
    else:
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

    if any(t in TIPOS_FACTURADOS for t, _ in pagos):
        await _guardar_cliente_desde_factura(factura_nombre, factura_nit, factura_celular)

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
    next: str = Form("/dashboard/ventas"),
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
    # Un cajero normal solo puede cambiar el método de pago mientras el turno
    # sigue abierto; el admin puede corregirlo también desde Control de
    # Turnos aunque el turno ya esté cerrado.
    elif orden["turno_estado"] != "abierto" and session.get("role") != "admin":
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

    if tipo_pago in TIPOS_FACTURADOS:
        await _guardar_cliente_desde_factura(factura_nombre, factura_nit, factura_celular)

    detalle = f"Orden #{orden_id} (mesa {orden['mesa']}) → {tipo_pago}"
    if tipo_pago in TIPOS_FACTURADOS:
        detalle += f", factura a nombre de {factura_nombre} (NIT {factura_nit})"
    if orden["turno_estado"] != "abierto":
        detalle += " (turno ya cerrado: si ya estaba contabilizado en el Libro Diario, revísalo a mano)."
    await bitacora.registrar(session, "Cambió método de pago de venta", detalle)
    return RedirectResponse(next, status_code=303)


@router.post("/ordenes/{orden_id}/hora")
async def editar_hora_orden(
    orden_id: int,
    session: dict = Depends(require_admin),
    hora: str = Form(""),
    next: str = Form("/dashboard/ventas"),
):
    """Corrige la hora de una venta desde Control de Turnos: la de cobro si
    ya está cobrada, o la de creación si todavía está pendiente."""
    orden = await pool().fetchrow("SELECT mesa, estado, creado_en, cobrado_en FROM ordenes WHERE id = $1", orden_id)
    hora_dt = _parse_hora_local(hora)
    if not orden or orden["estado"] not in ("abierta", "cobrada") or hora_dt is None:
        return RedirectResponse(next, status_code=303)

    if orden["estado"] == "cobrada":
        anterior = orden["cobrado_en"]
        await pool().execute("UPDATE ordenes SET cobrado_en = $1 WHERE id = $2", hora_dt, orden_id)
    else:
        anterior = orden["creado_en"]
        await pool().execute("UPDATE ordenes SET creado_en = $1 WHERE id = $2", hora_dt, orden_id)

    await bitacora.registrar(
        session, "Corrigió hora de venta",
        f"Orden #{orden_id} (mesa {orden['mesa']}): {anterior} → {hora_dt} "
        f"(si ya estaba contabilizada en el Libro Diario, la fecha del asiento no se ajusta sola).",
    )
    return RedirectResponse(next, status_code=303)


def _es_htmx(request: Request) -> bool:
    return request.headers.get("HX-Request") == "true"


async def _orden_items_context(orden_id: int) -> dict | None:
    orden = await pool().fetchrow(
        "SELECT id, mesa, estado, total, tipo_pago, responsable, creado_en, cobrado_en FROM ordenes WHERE id = $1",
        orden_id,
    )
    if not orden or orden["estado"] not in ("abierta", "cobrada"):
        return None
    items = await pool().fetch(
        "SELECT id, producto_nombre, cantidad, precio_unitario FROM orden_items WHERE orden_id = $1 ORDER BY id",
        orden_id,
    )
    # Solo productos de precio positivo: los de precio negativo son ajustes de
    # descuento que ya tienen su propio flujo dedicado ("Descuento" en
    # Cuentas pendientes), no corresponde mezclarlos en esta lista simple.
    por_categoria = {
        cat: [p for p in lista if float(p["precio_venta"]) >= 0]
        for cat, lista in (await _productos_por_categoria()).items()
    }
    por_categoria = {cat: lista for cat, lista in por_categoria.items() if lista}
    return {"active": "ventas", "orden": orden, "items": items, "por_categoria": por_categoria}


async def _recalcular_total_orden(conn, orden_id: int) -> None:
    total = await conn.fetchval(
        "SELECT COALESCE(SUM(cantidad * precio_unitario), 0) FROM orden_items WHERE orden_id = $1",
        orden_id,
    )
    await conn.execute("UPDATE ordenes SET total = $1 WHERE id = $2", float(total), orden_id)


@router.get("/ordenes/{orden_id}/items", response_class=HTMLResponse)
async def editar_items_orden_form(request: Request, orden_id: int, session: dict = Depends(require_session)):
    ctx = await _orden_items_context(orden_id)
    if not ctx:
        return RedirectResponse("/dashboard/ventas", status_code=303)
    ctx["session"] = session
    plantilla = "partials/_orden_items_modal.html" if _es_htmx(request) else "dashboard/orden_items.html"
    return templates.TemplateResponse(request, plantilla, ctx)


@router.post("/ordenes/{orden_id}/items")
async def editar_items_orden(
    request: Request,
    orden_id: int,
    session: dict = Depends(require_session),
    producto_id: str = Form(""),
    cantidad: str = Form("1"),
):
    orden = await pool().fetchrow("SELECT mesa, estado FROM ordenes WHERE id = $1", orden_id)
    if not orden or orden["estado"] not in ("abierta", "cobrada"):
        return RedirectResponse("/dashboard/ventas", status_code=303)

    try:
        cantidad_num = float(cantidad)
    except ValueError:
        cantidad_num = 0
    producto = (
        await pool().fetchrow("SELECT id, nombre, precio_venta FROM productos WHERE id = $1", int(producto_id))
        if producto_id.strip().isdigit() else None
    )

    if not producto or cantidad_num <= 0:
        if _es_htmx(request):
            ctx = await _orden_items_context(orden_id)
            ctx["session"] = session
            ctx["error"] = "Elige un producto y una cantidad válida."
            return templates.TemplateResponse(request, "partials/_orden_items_modal.html", ctx, status_code=400)
        return RedirectResponse(f"/dashboard/ventas/ordenes/{orden_id}/items", status_code=303)

    agregado = round(cantidad_num * float(producto["precio_venta"]), 2)
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO orden_items (orden_id, producto_id, producto_nombre, cantidad, precio_unitario) "
                "VALUES ($1, $2, $3, $4, $5)",
                orden_id, producto["id"], producto["nombre"], cantidad_num, float(producto["precio_venta"]),
            )
            await _recalcular_total_orden(conn, orden_id)

    await bitacora.registrar(
        session, "Agregó un producto a un pedido",
        f"Orden #{orden_id} (mesa {orden['mesa']}): +{cantidad_num:g}x {producto['nombre']} (Bs {agregado:.2f})",
    )
    if _es_htmx(request):
        ctx = await _orden_items_context(orden_id)
        ctx["session"] = session
        return templates.TemplateResponse(request, "partials/_orden_items_modal.html", ctx)
    return RedirectResponse(f"/dashboard/ventas/ordenes/{orden_id}/items", status_code=303)


@router.post("/ordenes/{orden_id}/items/{item_id}/editar")
async def editar_item_orden(
    request: Request, orden_id: int, item_id: int, session: dict = Depends(require_session), cantidad: str = Form("")
):
    orden = await pool().fetchrow("SELECT mesa, estado FROM ordenes WHERE id = $1", orden_id)
    if not orden or orden["estado"] not in ("abierta", "cobrada"):
        return RedirectResponse("/dashboard/ventas", status_code=303)

    item = await pool().fetchrow(
        "SELECT producto_nombre, cantidad AS cantidad_anterior FROM orden_items WHERE id = $1 AND orden_id = $2",
        item_id, orden_id,
    )
    if not item:
        return RedirectResponse(f"/dashboard/ventas/ordenes/{orden_id}/items", status_code=303)

    try:
        cantidad_num = float(cantidad)
    except ValueError:
        cantidad_num = 0
    if cantidad_num <= 0:
        return RedirectResponse(f"/dashboard/ventas/ordenes/{orden_id}/items", status_code=303)

    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("UPDATE orden_items SET cantidad = $1 WHERE id = $2", cantidad_num, item_id)
            await _recalcular_total_orden(conn, orden_id)

    await bitacora.registrar(
        session, "Cambió cantidad de un producto en un pedido",
        f"Orden #{orden_id} (mesa {orden['mesa']}): {item['producto_nombre']} "
        f"{item['cantidad_anterior']:g} → {cantidad_num:g}",
    )
    if _es_htmx(request):
        ctx = await _orden_items_context(orden_id)
        ctx["session"] = session
        return templates.TemplateResponse(request, "partials/_orden_items_modal.html", ctx)
    return RedirectResponse(f"/dashboard/ventas/ordenes/{orden_id}/items", status_code=303)


@router.post("/ordenes/{orden_id}/items/{item_id}/eliminar")
async def eliminar_item_orden(request: Request, orden_id: int, item_id: int, session: dict = Depends(require_session)):
    orden = await pool().fetchrow("SELECT mesa, estado FROM ordenes WHERE id = $1", orden_id)
    if not orden or orden["estado"] not in ("abierta", "cobrada"):
        return RedirectResponse("/dashboard/ventas", status_code=303)

    item = await pool().fetchrow(
        "SELECT producto_nombre, cantidad FROM orden_items WHERE id = $1 AND orden_id = $2", item_id, orden_id
    )
    if not item:
        return RedirectResponse(f"/dashboard/ventas/ordenes/{orden_id}/items", status_code=303)

    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM orden_items WHERE id = $1", item_id)
            await _recalcular_total_orden(conn, orden_id)

    await bitacora.registrar(
        session, "Quitó un producto de un pedido",
        f"Orden #{orden_id} (mesa {orden['mesa']}): {item['cantidad']:g}x {item['producto_nombre']}",
    )
    if _es_htmx(request):
        ctx = await _orden_items_context(orden_id)
        ctx["session"] = session
        return templates.TemplateResponse(request, "partials/_orden_items_modal.html", ctx)
    return RedirectResponse(f"/dashboard/ventas/ordenes/{orden_id}/items", status_code=303)


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
    request: Request,
    turno_id: int,
    session: dict = Depends(require_admin),
    monto_inicial: str = Form(""),
    next: str = Form("/dashboard/ventas"),
):
    try:
        monto = float(monto_inicial)
    except ValueError:
        monto = -1

    if monto < 0:
        ctx = await _ventas_context(session, error="Ingresa un monto de apertura válido.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    # Sin filtro de estado: desde Control de Turnos el admin puede corregir la
    # apertura de un turno cerrado también (p. ej. un error de tipeo del
    # cajero), no solo del turno abierto actual.
    turno_row = await pool().fetchrow("SELECT monto_inicial, estado FROM turnos WHERE id = $1", turno_id)
    if turno_row is None:
        ctx = await _ventas_context(session, error="Ese turno no existe.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    await pool().execute("UPDATE turnos SET monto_inicial = $1 WHERE id = $2", monto, turno_id)
    detalle = f"Turno #{turno_id}: Bs {float(turno_row['monto_inicial']):.2f} → Bs {monto:.2f}"
    if turno_row["estado"] != "abierto":
        detalle += " (turno ya cerrado: no cambia el monto contado ni el asiento de cierre, solo lo esperado)."
    await bitacora.registrar(session, "Corrigió apertura de turno", detalle)
    return RedirectResponse(next, status_code=303)


@router.post("/turno/{turno_id}/arqueo", response_class=HTMLResponse)
async def editar_arqueo_turno(
    request: Request,
    turno_id: int,
    session: dict = Depends(require_admin),
    corte: list[str] = Form([]),
    cantidad: list[str] = Form([]),
    next: str = Form("/dashboard/ventas"),
):
    """Corrige el arqueo (conteo de billetes/monedas) que ya quedó guardado
    al cerrar un turno. A propósito es solo para el admin: el cajero que
    contó la caja no debería poder ajustar después su propio conteo."""
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

    turno_row = await pool().fetchrow("SELECT monto_final_declarado FROM turnos WHERE id = $1", turno_id)
    if turno_row is None or not conteo:
        return RedirectResponse(next, status_code=303)

    anterior = turno_row["monto_final_declarado"]
    async with pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM conteo_caja WHERE turno_id = $1", turno_id)
            for c, t, q in conteo:
                await conn.execute(
                    "INSERT INTO conteo_caja (turno_id, corte, tipo, cantidad) VALUES ($1, $2, $3, $4)",
                    turno_id, c, t, q,
                )
            await conn.execute("UPDATE turnos SET monto_final_declarado = $1 WHERE id = $2", total, turno_id)

    anterior_txt = f"Bs {float(anterior):.2f}" if anterior is not None else "—"
    await bitacora.registrar(
        session, "Corrigió arqueo de caja de turno",
        f"Turno #{turno_id}: {anterior_txt} → Bs {total:.2f} "
        f"(no ajusta ningún asiento del Libro Diario si el turno ya se cerró contablemente).",
    )
    return RedirectResponse(next, status_code=303)


@router.post("/turno/{turno_id}/cerrar", response_class=HTMLResponse)
async def cerrar_turno(
    request: Request,
    turno_id: int,
    session: dict = Depends(require_session),
    corte: list[str] = Form([]),
    cantidad: list[str] = Form([]),
    confirmar_pendientes: str = Form(""),
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

    pendientes = await pool().fetchval("SELECT COUNT(*) FROM ordenes WHERE estado = 'abierta'")
    if pendientes and not confirmar_pendientes:
        ctx = await _ventas_context(
            session,
            error=f"Hay {pendientes} cuenta(s) pendiente(s) por cobrar. Cóbralas antes de cerrar, "
            "o marca la casilla de \"dejar pendientes para el siguiente turno\" en Cerrar turno.",
        )
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    turno_cerrado = await pool().fetchrow(
        "UPDATE turnos SET estado = 'cerrado', monto_final_declarado = $1, cerrado_en = now() "
        "WHERE id = $2 AND estado = 'abierto' RETURNING monto_inicial, responsable",
        total,
        turno_id,
    )
    if not turno_cerrado:
        return RedirectResponse("/dashboard/ventas", status_code=303)

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
    await _registrar_traslado_arqueo_a_caja_chica_en_diario(turno_id, turno_cerrado["responsable"], total)

    teorico = await _efectivo_teorico_turno(turno_id, turno_cerrado["monto_inicial"])
    diferencia = round(total - teorico, 2)
    if abs(diferencia) < 0.01:
        estado_arqueo, detalle_arqueo = "completo", "cuadra exacto"
    elif diferencia > 0:
        estado_arqueo, detalle_arqueo = "sobra", f"sobran Bs {diferencia:.2f}"
    else:
        estado_arqueo, detalle_arqueo = "falta", f"faltan Bs {abs(diferencia):.2f}"

    await bitacora.registrar(
        session, "Cerró turno",
        f"Turno #{turno_id}, monto final Bs {total:.2f} (arqueo de caja). "
        f"Esperado Bs {teorico:.2f} → {detalle_arqueo}.",
    )
    return RedirectResponse(
        f"/dashboard/ventas?cierre_estado={estado_arqueo}&cierre_diferencia={abs(diferencia):.2f}",
        status_code=303,
    )


@router.post("/movimientos", response_class=HTMLResponse)
async def registrar_movimiento_caja(
    request: Request,
    session: dict = Depends(require_session),
    turno_id: str = Form(""),
    monto: str = Form(""),
    motivo: str = Form(""),
    tipo_pago: str = Form(""),
    categoria: str = Form(""),
    hora: str = Form(""),
    next: str = Form("/dashboard/ventas"),
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

    # Solo el admin puede poner una hora distinta a "ahora" (p. ej. al
    # cargar a mano un egreso atrasado desde Control de Turnos); un cajero
    # no puede adelantar/atrasar el registro.
    hora_dt = _parse_hora_local(hora) if session.get("role") == "admin" else None
    await pool().execute(
        "INSERT INTO movimientos_caja (turno_id, tipo, monto, motivo, responsable, tipo_pago, categoria, creado_en) "
        "VALUES ($1, 'egreso', $2, $3, $4, $5, $6, COALESCE($7, now()))",
        int(turno_id),
        monto_num,
        motivo,
        session["nombre"],
        tipo_pago,
        categoria,
        hora_dt,
    )
    await _registrar_egreso_en_diario(monto_num, tipo_pago, categoria, motivo, session["nombre"])
    await bitacora.registrar(session, "Registró egreso de caja", f"{categoria} — Bs {monto_num:.2f} — {motivo}")
    return RedirectResponse(next, status_code=303)


@router.post("/movimientos/ingreso", response_class=HTMLResponse)
async def registrar_ingreso_caja(
    request: Request,
    session: dict = Depends(require_session),
    turno_id: str = Form(""),
    monto: str = Form(""),
    motivo: str = Form(""),
    tipo_pago: str = Form(""),
    hora: str = Form(""),
    next: str = Form("/dashboard/ventas#ingresos-turno"),
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

    hora_dt = _parse_hora_local(hora) if session.get("role") == "admin" else None
    await pool().execute(
        "INSERT INTO movimientos_caja (turno_id, tipo, monto, motivo, responsable, tipo_pago, creado_en) "
        "VALUES ($1, 'ingreso', $2, $3, $4, $5, COALESCE($6, now()))",
        int(turno_id),
        monto_num,
        motivo,
        session["nombre"],
        tipo_pago,
        hora_dt,
    )
    await _registrar_ingreso_caja_en_diario(monto_num, tipo_pago, motivo, session["nombre"])
    await bitacora.registrar(session, "Registró ingreso a caja", f"Bs {monto_num:.2f} — {motivo} ({tipo_pago})")
    return RedirectResponse(next, status_code=303)


@router.post("/movimientos/reposicion", response_class=HTMLResponse)
async def registrar_reposicion_caja(
    request: Request,
    session: dict = Depends(require_session),
    turno_id: str = Form(""),
    monto: str = Form(""),
    motivo: str = Form(""),
    hora: str = Form(""),
    next: str = Form("/dashboard/ventas#reposiciones-turno"),
):
    motivo = motivo.strip()
    try:
        monto_num = float(monto)
    except ValueError:
        monto_num = 0

    if not turno_id or monto_num <= 0 or not motivo:
        ctx = await _ventas_context(session, error="Completa el motivo y el monto (mayor a 0) de la reposición.")
        return templates.TemplateResponse(request, "dashboard/ventas.html", ctx, status_code=400)

    hora_dt = _parse_hora_local(hora) if session.get("role") == "admin" else None
    await pool().execute(
        "INSERT INTO movimientos_caja (turno_id, tipo, monto, motivo, responsable, tipo_pago, creado_en) "
        "VALUES ($1, 'reposicion', $2, $3, $4, 'EFECTIVO', COALESCE($5, now()))",
        int(turno_id),
        monto_num,
        motivo,
        session["nombre"],
        hora_dt,
    )
    await _registrar_reposicion_caja_en_diario(monto_num, motivo, session["nombre"])
    await bitacora.registrar(session, "Registró reposición de caja", f"Bs {monto_num:.2f} — {motivo}")
    return RedirectResponse(next, status_code=303)


@router.post("/movimientos/{movimiento_id}/editar-ingreso", response_class=HTMLResponse)
async def editar_ingreso_caja(
    request: Request,
    movimiento_id: int,
    session: dict = Depends(require_session),
    monto: str = Form(""),
    motivo: str = Form(""),
    tipo_pago: str = Form(""),
    hora: str = Form(""),
    next: str = Form("/dashboard/ventas#ingresos-turno"),
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

    hora_dt = _parse_hora_local(hora) if session.get("role") == "admin" else None
    await pool().execute(
        "UPDATE movimientos_caja SET monto = $1, motivo = $2, tipo_pago = $3, "
        "creado_en = COALESCE($4, creado_en) WHERE id = $5",
        monto_num, motivo, tipo_pago, hora_dt, movimiento_id,
    )
    await bitacora.registrar(
        session, "Editó ingreso a caja",
        f"Movimiento #{movimiento_id}: Bs {monto_num:.2f} — {motivo} ({tipo_pago}) "
        f"(si ya estaba contabilizado en el Libro Diario, el asiento original no se ajusta solo — revísalo a mano).",
    )
    return RedirectResponse(next, status_code=303)


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
    hora: str = Form(""),
    next: str = Form("/dashboard/ventas"),
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

    hora_dt = _parse_hora_local(hora) if session.get("role") == "admin" else None
    await pool().execute(
        "UPDATE movimientos_caja SET monto = $1, motivo = $2, tipo_pago = $3, categoria = $4, "
        "creado_en = COALESCE($5, creado_en) WHERE id = $6",
        monto_num,
        motivo,
        tipo_pago,
        categoria,
        hora_dt,
        movimiento_id,
    )
    await bitacora.registrar(
        session, "Editó egreso de caja",
        f"Movimiento #{movimiento_id}: {categoria} — Bs {monto_num:.2f} — {motivo} "
        f"(si ya estaba contabilizado en el Libro Diario, el asiento original no se ajusta solo — revísalo a mano).",
    )
    return RedirectResponse(next, status_code=303)


@router.post("/movimientos/{movimiento_id}/eliminar")
async def eliminar_movimiento_caja(
    movimiento_id: int, session: dict = Depends(require_session), next: str = Form("/dashboard/ventas")
):
    movimiento = await pool().fetchrow("SELECT tipo, motivo, monto FROM movimientos_caja WHERE id = $1", movimiento_id)
    if movimiento:
        await pool().execute("DELETE FROM movimientos_caja WHERE id = $1", movimiento_id)
        accion = {
            "ingreso": "Eliminó ingreso a caja",
            "reposicion": "Eliminó reposición de caja",
        }.get(movimiento["tipo"], "Eliminó egreso de caja")
        await bitacora.registrar(
            session, accion, f"Movimiento #{movimiento_id}, Bs {movimiento['monto']:.2f} — {movimiento['motivo']}"
        )
    return RedirectResponse(next, status_code=303)
