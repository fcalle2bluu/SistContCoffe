import asyncio
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends

from app.db import pool
from app.deps import require_dashboard
from app.tz import BOLIVIA_TZ, ahora_bolivia

router = APIRouter(prefix="/dashboard/api")

PERIODOS = ("hoy", "7d", "30d", "anio", "todos")


def _rango_periodo(periodo: str) -> tuple[str, datetime, datetime]:
    hoy = ahora_bolivia().date()
    fin = datetime.combine(hoy, time.min, BOLIVIA_TZ) + timedelta(days=1)

    if periodo == "hoy":
        inicio = datetime.combine(hoy, time.min, BOLIVIA_TZ)
        return "hora", inicio, fin
    if periodo == "30d":
        inicio = datetime.combine(hoy - timedelta(days=29), time.min, BOLIVIA_TZ)
        return "dia", inicio, fin
    if periodo == "anio":
        inicio = datetime.combine(date(hoy.year, 1, 1), time.min, BOLIVIA_TZ)
        return "mes", inicio, fin
    if periodo == "todos":
        inicio = datetime.combine(date(2000, 1, 1), time.min, BOLIVIA_TZ)
        return "mes", inicio, fin
    # "7d" (y cualquier valor no reconocido) por defecto
    inicio = datetime.combine(hoy - timedelta(days=6), time.min, BOLIVIA_TZ)
    return "dia", inicio, fin


def _bucket_expr(granularidad: str) -> str:
    if granularidad == "hora":
        return "date_trunc('hour', cobrado_en AT TIME ZONE 'America/La_Paz')"
    if granularidad == "mes":
        return "date_trunc('month', cobrado_en AT TIME ZONE 'America/La_Paz')"
    return "(cobrado_en AT TIME ZONE 'America/La_Paz')::date"


def _etiqueta(granularidad: str, bucket) -> str:
    if granularidad == "hora":
        return bucket.strftime("%H:00")
    if granularidad == "mes":
        return bucket.strftime("%m/%Y")
    return bucket.strftime("%d/%m")


def _clave(granularidad: str, bucket) -> str:
    if granularidad == "hora":
        return bucket.strftime("%Y-%m-%dT%H")
    if granularidad == "mes":
        return bucket.strftime("%Y-%m")
    return bucket.strftime("%Y-%m-%d")


def _rango_desde_clave(granularidad: str, clave: str) -> tuple[datetime, datetime]:
    if granularidad == "hora":
        inicio_naive = datetime.strptime(clave, "%Y-%m-%dT%H")
        inicio = inicio_naive.replace(tzinfo=BOLIVIA_TZ)
        return inicio, inicio + timedelta(hours=1)
    if granularidad == "mes":
        anio, mes = (int(x) for x in clave.split("-"))
        inicio = datetime(anio, mes, 1, tzinfo=BOLIVIA_TZ)
        fin = datetime(anio + 1, 1, 1, tzinfo=BOLIVIA_TZ) if mes == 12 else datetime(anio, mes + 1, 1, tzinfo=BOLIVIA_TZ)
        return inicio, fin
    inicio_naive = datetime.strptime(clave, "%Y-%m-%d")
    inicio = inicio_naive.replace(tzinfo=BOLIVIA_TZ)
    return inicio, inicio + timedelta(days=1)


@router.get("/resumen")
async def resumen(periodo: str = "7d", session: dict = Depends(require_dashboard)):
    if periodo not in PERIODOS:
        periodo = "7d"
    granularidad, inicio, fin = _rango_periodo(periodo)
    bucket_sql = _bucket_expr(granularidad)

    filas_serie, top_productos, categorias, metodos_pago = await asyncio.gather(
        pool().fetch(
            f"SELECT {bucket_sql} AS bucket, SUM(total) AS total FROM ordenes "
            "WHERE estado = 'cobrada' AND cobrado_en >= $1 AND cobrado_en < $2 "
            "GROUP BY bucket ORDER BY bucket",
            inicio,
            fin,
        ),
        pool().fetch(
            "SELECT oi.producto_nombre AS nombre, SUM(oi.cantidad) AS cantidad, "
            "SUM(oi.cantidad * oi.precio_unitario) AS monto "
            "FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id "
            "WHERE o.estado = 'cobrada' AND o.cobrado_en >= $1 AND o.cobrado_en < $2 "
            "GROUP BY oi.producto_nombre ORDER BY cantidad DESC LIMIT 10",
            inicio,
            fin,
        ),
        pool().fetch(
            "SELECT COALESCE(p.categoria, 'Otros') AS nombre, SUM(oi.cantidad) AS cantidad, "
            "SUM(oi.cantidad * oi.precio_unitario) AS monto "
            "FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id "
            "LEFT JOIN productos p ON p.id = oi.producto_id "
            "WHERE o.estado = 'cobrada' AND o.cobrado_en >= $1 AND o.cobrado_en < $2 "
            "GROUP BY p.categoria ORDER BY monto DESC",
            inicio,
            fin,
        ),
        pool().fetch(
            "SELECT tipo_pago AS nombre, COUNT(*) AS cantidad, SUM(total) AS monto FROM ordenes "
            "WHERE estado = 'cobrada' AND cobrado_en >= $1 AND cobrado_en < $2 AND tipo_pago IS NOT NULL "
            "GROUP BY tipo_pago ORDER BY monto DESC",
            inicio,
            fin,
        ),
    )
    por_bucket = {f["bucket"]: float(f["total"]) for f in filas_serie}

    # Postgres devuelve "AT TIME ZONE" como timestamp naive (hora local sin tz);
    # los buckets "hora"/"mes" hay que compararlos sin tzinfo. "dia" devuelve un date.
    claves: list[str] = []
    etiquetas: list[str] = []
    datos: list[float] = []
    if granularidad == "hora":
        cursor = inicio
        while cursor < fin:
            claves.append(_clave(granularidad, cursor))
            etiquetas.append(_etiqueta(granularidad, cursor))
            datos.append(por_bucket.get(cursor.replace(tzinfo=None), 0.0))
            cursor += timedelta(hours=1)
    elif granularidad == "dia":
        cursor = inicio
        while cursor < fin:
            claves.append(_clave(granularidad, cursor))
            etiquetas.append(_etiqueta(granularidad, cursor))
            datos.append(por_bucket.get(cursor.date(), 0.0))
            cursor += timedelta(days=1)
    else:  # mes
        for bucket, total in sorted(por_bucket.items()):
            claves.append(_clave(granularidad, bucket))
            etiquetas.append(_etiqueta(granularidad, bucket))
            datos.append(total)

    return {
        "granularidad": granularidad,
        "serie": {"labels": etiquetas, "claves": claves, "datos": datos},
        "top_productos": [
            {"nombre": r["nombre"], "cantidad": float(r["cantidad"]), "monto": float(r["monto"])}
            for r in top_productos
        ],
        "categorias": [
            {"nombre": r["nombre"], "cantidad": float(r["cantidad"]), "monto": float(r["monto"])}
            for r in categorias
        ],
        "metodos_pago": [
            {"nombre": r["nombre"], "cantidad": r["cantidad"], "monto": float(r["monto"])}
            for r in metodos_pago
        ],
    }


async def _productos_vendidos(inicio: datetime, fin: datetime, categoria: str | None, metodo: str | None):
    condiciones = ["o.estado = 'cobrada'", "o.cobrado_en >= $1", "o.cobrado_en < $2"]
    args: list = [inicio, fin]
    if categoria:
        args.append(categoria)
        condiciones.append(f"COALESCE(p.categoria, 'Otros') = ${len(args)}")
    if metodo:
        args.append(metodo)
        condiciones.append(f"o.tipo_pago = ${len(args)}")

    filas = await pool().fetch(
        "SELECT oi.producto_nombre AS nombre, SUM(oi.cantidad) AS cantidad, "
        "SUM(oi.cantidad * oi.precio_unitario) AS monto "
        "FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id "
        "LEFT JOIN productos p ON p.id = oi.producto_id "
        f"WHERE {' AND '.join(condiciones)} "
        "GROUP BY oi.producto_nombre ORDER BY monto DESC LIMIT 15",
        *args,
    )
    return [
        {"nombre": r["nombre"], "cantidad": float(r["cantidad"]), "monto": float(r["monto"])} for r in filas
    ]


@router.get("/detalle-tiempo")
async def detalle_tiempo(periodo: str, clave: str, session: dict = Depends(require_dashboard)):
    if periodo not in PERIODOS:
        periodo = "7d"
    granularidad, _, _ = _rango_periodo(periodo)
    inicio, fin = _rango_desde_clave(granularidad, clave)
    items = await _productos_vendidos(inicio, fin, None, None)
    return {"titulo": f"Productos vendidos — {_etiqueta(granularidad, inicio)}", "items": items}


@router.get("/detalle-categoria")
async def detalle_categoria(periodo: str, categoria: str, session: dict = Depends(require_dashboard)):
    if periodo not in PERIODOS:
        periodo = "7d"
    _, inicio, fin = _rango_periodo(periodo)
    items = await _productos_vendidos(inicio, fin, categoria, None)
    return {"titulo": f"Productos vendidos — {categoria}", "items": items}


@router.get("/detalle-pago")
async def detalle_pago(periodo: str, metodo: str, session: dict = Depends(require_dashboard)):
    if periodo not in PERIODOS:
        periodo = "7d"
    _, inicio, fin = _rango_periodo(periodo)
    items = await _productos_vendidos(inicio, fin, None, metodo)
    return {"titulo": f"Productos vendidos — pagado con {metodo}", "items": items}
