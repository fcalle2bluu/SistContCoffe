from datetime import date

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_session
from app.templating import templates

router = APIRouter(prefix="/dashboard/inventario-peps")

TIPOS_MOVIMIENTO = ("entrada", "salida")


def _calcular_ledger(movimientos: list) -> list[dict]:
    """Recalcula el kardex PEPS (FIFO) de una lista de movimientos ya
    ordenados por (fecha, id). Cada entrada abre una capa de costo nueva;
    cada salida consume las capas más antiguas primero, aunque eso implique
    repartirse entre varias capas con costos distintos. Devuelve la misma
    lista de movimientos con las columnas calculadas (costo, debe, haber,
    saldo en kg y en Bs, merma de tueste) tal como las muestra el Excel."""
    capas: list[dict] = []
    saldo_cantidad = 0.0
    saldo_valor = 0.0
    filas = []

    for m in movimientos:
        fila = dict(m)
        cantidad = float(m["cantidad"])

        if m["tipo"] == "entrada":
            costo = float(m["costo_unitario"] or 0)
            capas.append({"cantidad": cantidad, "costo": costo})
            debe = cantidad * costo
            haber = 0.0
            saldo_cantidad += cantidad
            saldo_valor += debe
            fila["costo_calc"] = costo
            fila["insuficiente"] = False
        else:
            restante = cantidad
            costo_total = 0.0
            while restante > 1e-9 and capas:
                capa = capas[0]
                tomar = min(capa["cantidad"], restante)
                costo_total += tomar * capa["costo"]
                capa["cantidad"] -= tomar
                restante -= tomar
                if capa["cantidad"] <= 1e-9:
                    capas.pop(0)
            insuficiente = restante > 1e-9
            if insuficiente:
                ultimo_costo = capas[0]["costo"] if capas else (filas[-1]["costo_calc"] if filas else 0.0)
                costo_total += restante * ultimo_costo
            debe = 0.0
            haber = costo_total
            saldo_cantidad -= cantidad
            saldo_valor -= costo_total
            fila["costo_calc"] = (costo_total / cantidad) if cantidad else 0.0
            fila["insuficiente"] = insuficiente

        fila["debe"] = debe
        fila["haber"] = haber
        fila["saldo_cantidad"] = saldo_cantidad
        fila["saldo_valor"] = saldo_valor
        if m["tipo"] == "salida" and m.get("merma_pct"):
            fila["merma_tueste"] = cantidad * float(m["merma_pct"]) / 100
        else:
            fila["merma_tueste"] = None
        filas.append(fila)

    return filas


async def _productos():
    return await pool().fetch("SELECT id, nombre, unidad FROM peps_productos ORDER BY nombre")


async def _context(session: dict, producto_id: int | None, error: str | None = None) -> dict:
    productos = await _productos()
    if producto_id is None and productos:
        producto_id = productos[0]["id"]

    ledger = []
    saldo_actual = 0.0
    if producto_id:
        movimientos = await pool().fetch(
            "SELECT * FROM peps_movimientos WHERE producto_id = $1 ORDER BY fecha, id", producto_id
        )
        ledger = _calcular_ledger(movimientos)
        if ledger:
            saldo_actual = ledger[-1]["saldo_cantidad"]

    return {
        "session": session,
        "active": "inventario_peps",
        "productos": productos,
        "producto_id": producto_id,
        "ledger": ledger,
        "saldo_actual": saldo_actual,
        "error": error,
    }


@router.get("", response_class=HTMLResponse)
async def inventario_peps_page(
    request: Request, session: dict = Depends(require_session), producto_id: int | None = None
):
    ctx = await _context(session, producto_id)
    return templates.TemplateResponse(request, "dashboard/inventario_peps.html", ctx)


@router.post("/productos", response_class=HTMLResponse)
async def crear_producto_peps(
    request: Request,
    session: dict = Depends(require_session),
    nombre: str = Form(""),
    unidad: str = Form("kg"),
):
    nombre = nombre.strip()
    unidad = unidad.strip() or "kg"
    if not nombre:
        ctx = await _context(session, None, error="Escribe el nombre del producto o materia prima.")
        return templates.TemplateResponse(request, "dashboard/inventario_peps.html", ctx, status_code=400)

    fila = await pool().fetchrow(
        "INSERT INTO peps_productos (nombre, unidad) VALUES ($1, $2) "
        "ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id",
        nombre, unidad,
    )
    await bitacora.registrar(session, "Creó producto PEPS", nombre)
    return RedirectResponse(f"/dashboard/inventario-peps?producto_id={fila['id']}", status_code=303)


@router.post("/productos/{producto_id}/editar", response_class=HTMLResponse)
async def editar_producto_peps(
    request: Request,
    producto_id: int,
    session: dict = Depends(require_session),
    nombre: str = Form(""),
    unidad: str = Form("kg"),
):
    nombre = nombre.strip()
    unidad = unidad.strip() or "kg"
    if not nombre:
        ctx = await _context(session, producto_id, error="Escribe el nombre del producto o materia prima.")
        return templates.TemplateResponse(request, "dashboard/inventario_peps.html", ctx, status_code=400)

    anterior = await pool().fetchval("SELECT nombre FROM peps_productos WHERE id = $1", producto_id)
    if anterior is None:
        return RedirectResponse("/dashboard/inventario-peps", status_code=303)

    await pool().execute(
        "UPDATE peps_productos SET nombre = $1, unidad = $2 WHERE id = $3", nombre, unidad, producto_id
    )
    await bitacora.registrar(session, "Editó producto PEPS", f"{anterior} → {nombre}")
    return RedirectResponse(f"/dashboard/inventario-peps?producto_id={producto_id}", status_code=303)


@router.post("/productos/{producto_id}/eliminar")
async def eliminar_producto_peps(producto_id: int, session: dict = Depends(require_session)):
    producto = await pool().fetchrow("SELECT nombre FROM peps_productos WHERE id = $1", producto_id)
    if producto:
        await pool().execute("DELETE FROM peps_productos WHERE id = $1", producto_id)
        await bitacora.registrar(session, "Eliminó producto PEPS", f"{producto['nombre']} (y todos sus movimientos)")
    return RedirectResponse("/dashboard/inventario-peps", status_code=303)


@router.post("/movimientos", response_class=HTMLResponse)
async def crear_movimiento_peps(
    request: Request,
    session: dict = Depends(require_session),
    producto_id: str = Form(""),
    tipo: str = Form(""),
    fecha_mov: str = Form(""),
    detalle: str = Form(""),
    cantidad: str = Form(""),
    costo_unitario: str = Form(""),
    tipo_tueste: str = Form(""),
    clima: str = Form(""),
    curva_tueste: str = Form(""),
    primer_crack: str = Form(""),
    merma_pct: str = Form(""),
):
    detalle = detalle.strip()
    error = None
    try:
        producto_id_num = int(producto_id)
    except ValueError:
        producto_id_num = None

    try:
        cantidad_num = round(float(cantidad), 3)
    except ValueError:
        cantidad_num = None

    costo_num = None
    if costo_unitario.strip():
        try:
            costo_num = round(float(costo_unitario), 4)
        except ValueError:
            costo_num = -1

    merma_num = None
    if merma_pct.strip():
        try:
            merma_num = round(float(merma_pct), 2)
        except ValueError:
            merma_num = None

    if not producto_id_num or tipo not in TIPOS_MOVIMIENTO or not fecha_mov or not detalle or not cantidad_num or cantidad_num <= 0:
        error = "Completa producto, tipo, fecha, detalle y una cantidad mayor a 0."
    elif tipo == "entrada" and (costo_num is None or costo_num <= 0):
        error = "Toda entrada necesita un costo unitario mayor a 0."

    if not error and tipo == "salida":
        saldo_disponible = await pool().fetchval(
            "SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN cantidad ELSE -cantidad END), 0) "
            "FROM peps_movimientos WHERE producto_id = $1",
            producto_id_num,
        )
        if cantidad_num > float(saldo_disponible or 0) + 1e-9:
            error = f"No hay suficiente saldo: quedan {float(saldo_disponible or 0):.3f} disponibles y quieres sacar {cantidad_num:.3f}."

    if error:
        ctx = await _context(session, producto_id_num, error=error)
        return templates.TemplateResponse(request, "dashboard/inventario_peps.html", ctx, status_code=400)

    await pool().execute(
        """
        INSERT INTO peps_movimientos
            (producto_id, fecha, detalle, tipo, cantidad, costo_unitario,
             tipo_tueste, clima, curva_tueste, primer_crack, merma_pct, creado_por)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        """,
        producto_id_num,
        date.fromisoformat(fecha_mov),
        detalle,
        tipo,
        cantidad_num,
        costo_num if tipo == "entrada" else None,
        tipo_tueste.strip() or None,
        clima.strip() or None,
        curva_tueste.strip() or None,
        primer_crack.strip() or None,
        merma_num,
        session["nombre"],
    )
    await bitacora.registrar(
        session, "Registró movimiento PEPS",
        f"{tipo.capitalize()} de {cantidad_num} — {detalle} (producto #{producto_id_num})",
    )
    return RedirectResponse(f"/dashboard/inventario-peps?producto_id={producto_id_num}", status_code=303)


@router.post("/movimientos/{movimiento_id}/eliminar")
async def eliminar_movimiento_peps(movimiento_id: int, session: dict = Depends(require_session)):
    mov = await pool().fetchrow("SELECT producto_id, detalle FROM peps_movimientos WHERE id = $1", movimiento_id)
    if mov:
        await pool().execute("DELETE FROM peps_movimientos WHERE id = $1", movimiento_id)
        await bitacora.registrar(session, "Eliminó movimiento PEPS", mov["detalle"])
        return RedirectResponse(f"/dashboard/inventario-peps?producto_id={mov['producto_id']}", status_code=303)
    return RedirectResponse("/dashboard/inventario-peps", status_code=303)
