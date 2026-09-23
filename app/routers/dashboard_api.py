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


PALETA_TURNOS = ("#d97706", "#2563eb", "#059669", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d")


@router.get("/ventas-por-hora")
async def ventas_por_hora(fecha: str, session: dict = Depends(require_dashboard)):
    try:
        dia = date.fromisoformat(fecha)
    except ValueError:
        dia = ahora_bolivia().date()
    inicio = datetime.combine(dia, time.min, BOLIVIA_TZ)
    fin = inicio + timedelta(days=1)

    filas = await pool().fetch(
        """
        SELECT o.turno_id, COALESCE(t.responsable, 'Sin turno') AS turno_responsable,
               date_trunc('hour', o.cobrado_en AT TIME ZONE 'America/La_Paz') AS hora,
               SUM(o.total) AS total
        FROM ordenes o
        LEFT JOIN turnos t ON t.id = o.turno_id
        WHERE o.estado = 'cobrada' AND o.cobrado_en >= $1 AND o.cobrado_en < $2
        GROUP BY o.turno_id, t.responsable, date_trunc('hour', o.cobrado_en AT TIME ZONE 'America/La_Paz')
        ORDER BY MIN(date_trunc('hour', o.cobrado_en AT TIME ZONE 'America/La_Paz')) OVER (PARTITION BY o.turno_id),
                 date_trunc('hour', o.cobrado_en AT TIME ZONE 'America/La_Paz')
        """,
        inicio,
        fin,
    )

    turnos_orden: list[int | None] = []
    turnos_info: dict[int | None, dict] = {}
    for r in filas:
        tid = r["turno_id"]
        if tid not in turnos_info:
            turnos_info[tid] = {"responsable": r["turno_responsable"], "horas": {}}
            turnos_orden.append(tid)
        turnos_info[tid]["horas"][r["hora"]] = float(r["total"])

    etiquetas = [f"{h:02d}:00" for h in range(24)]
    datasets = []
    for i, tid in enumerate(turnos_orden):
        info = turnos_info[tid]
        datos = [info["horas"].get(datetime.combine(dia, time(hour=h)), 0.0) for h in range(24)]
        datasets.append({
            "turno_id": tid,
            "responsable": info["responsable"],
            "color": PALETA_TURNOS[i % len(PALETA_TURNOS)],
            "datos": datos,
        })

    return {"fecha": dia.isoformat(), "etiquetas": etiquetas, "datasets": datasets}


@router.get("/detalle-hora")
async def detalle_hora(
    fecha: str, hora: int, turno_id: int | None = None, session: dict = Depends(require_dashboard)
):
    try:
        dia = date.fromisoformat(fecha)
    except ValueError:
        dia = ahora_bolivia().date()
    inicio = datetime.combine(dia, time(hour=hora), BOLIVIA_TZ)
    fin = inicio + timedelta(hours=1)

    condiciones = ["o.estado = 'cobrada'", "o.cobrado_en >= $1", "o.cobrado_en < $2"]
    args: list = [inicio, fin]
    if turno_id is not None:
        args.append(turno_id)
        condiciones.append(f"o.turno_id = ${len(args)}")

    ordenes = await pool().fetch(
        "SELECT o.id, o.mesa, o.total, o.tipo_pago, o.cobrado_en, o.responsable, "
        "COALESCE(t.responsable, 'Sin turno') AS turno_responsable "
        "FROM ordenes o LEFT JOIN turnos t ON t.id = o.turno_id "
        f"WHERE {' AND '.join(condiciones)} ORDER BY o.cobrado_en",
        *args,
    )

    items_por_orden: dict[int, list] = {}
    if ordenes:
        item_rows = await pool().fetch(
            "SELECT orden_id, producto_nombre, cantidad FROM orden_items "
            "WHERE orden_id = ANY($1::int[]) ORDER BY id",
            [o["id"] for o in ordenes],
        )
        for r in item_rows:
            items_por_orden.setdefault(r["orden_id"], []).append(r)

    ventas = [
        {
            "mesa": o["mesa"],
            "hora": o["cobrado_en"].astimezone(BOLIVIA_TZ).strftime("%H:%M"),
            "total": float(o["total"]),
            "tipo_pago": o["tipo_pago"] or "—",
            "responsable": o["responsable"],
            "turno_responsable": o["turno_responsable"],
            "items": ", ".join(
                f"{float(it['cantidad']):g}x {it['producto_nombre']}" for it in items_por_orden.get(o["id"], [])
            ) or "—",
        }
        for o in ordenes
    ]
    return {
        "titulo": f"Ventas de las {hora:02d}:00 a las {hora:02d}:59 — {dia.strftime('%d/%m/%Y')}",
        "ventas": ventas,
    }


DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]
DIAS_LARGOS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def _domingo_de_semana(dia: date) -> date:
    # date.weekday(): lunes=0 ... domingo=6. Queremos que la semana empiece domingo.
    dias_desde_domingo = (dia.weekday() + 1) % 7
    return dia - timedelta(days=dias_desde_domingo)


async def _totales_por_dia(inicio: datetime, fin: datetime) -> dict[date, float]:
    filas = await pool().fetch(
        "SELECT (cobrado_en AT TIME ZONE 'America/La_Paz')::date AS dia, SUM(total) AS total "
        "FROM ordenes WHERE estado = 'cobrada' AND cobrado_en >= $1 AND cobrado_en < $2 GROUP BY dia",
        inicio,
        fin,
    )
    return {f["dia"]: float(f["total"]) for f in filas}


@router.get("/actividad-ventas")
async def actividad_ventas(fecha: str, session: dict = Depends(require_dashboard)):
    hoy = ahora_bolivia().date()
    try:
        dia = date.fromisoformat(fecha)
    except ValueError:
        dia = hoy

    domingo = _domingo_de_semana(dia)
    sabado = domingo + timedelta(days=6)
    indice_dia = (dia - domingo).days  # 0=domingo .. 6=sábado

    inicio_semana = datetime.combine(domingo, time.min, BOLIVIA_TZ)
    fin_semana = datetime.combine(sabado, time.min, BOLIVIA_TZ) + timedelta(days=1)
    inicio_semana_ant = inicio_semana - timedelta(days=7)

    por_dia, por_dia_ant, categorias = await asyncio.gather(
        _totales_por_dia(inicio_semana, fin_semana),
        _totales_por_dia(inicio_semana_ant, inicio_semana),
        pool().fetch(
            "SELECT COALESCE(p.categoria, 'Otros') AS nombre, SUM(oi.cantidad * oi.precio_unitario) AS monto "
            "FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id "
            "LEFT JOIN productos p ON p.id = oi.producto_id "
            "WHERE o.estado = 'cobrada' AND o.cobrado_en >= $1 AND o.cobrado_en < $2 "
            "GROUP BY p.categoria ORDER BY monto DESC",
            datetime.combine(dia, time.min, BOLIVIA_TZ),
            datetime.combine(dia, time.min, BOLIVIA_TZ) + timedelta(days=1),
        ),
    )

    serie = []
    for i in range(7):
        d = domingo + timedelta(days=i)
        serie.append({
            "fecha": d.isoformat(),
            "etiqueta": DIAS_CORTOS[i],
            "monto": por_dia.get(d, 0.0),
            "es_actual": d == dia,
            "es_futuro": d > hoy,
        })

    total_dia = por_dia.get(dia, 0.0)
    total_semana = sum(s["monto"] for s in serie if not s["es_futuro"])
    dias_con_ventas = sum(1 for s in serie if not s["es_futuro"] and s["monto"] > 0)
    promedio_dia = (total_semana / dias_con_ventas) if dias_con_ventas else 0.0
    vs_promedio_pct = ((total_dia - promedio_dia) / promedio_dia * 100) if promedio_dia else 0.0

    parcial_actual = sum(s["monto"] for s in serie[: indice_dia + 1])
    parcial_anterior = sum(por_dia_ant.get(domingo - timedelta(days=7) + timedelta(days=i), 0.0) for i in range(indice_dia + 1))
    vs_semana_anterior_pct = (
        ((parcial_actual - parcial_anterior) / parcial_anterior * 100) if parcial_anterior else 0.0
    )

    dias_con_datos = [s for s in serie if s["monto"] > 0]
    mejor = max(dias_con_datos, key=lambda s: s["monto"]) if dias_con_datos else None
    mejor_dia = None
    if mejor:
        idx = serie.index(mejor)
        mejor_dia = {"etiqueta": DIAS_LARGOS[idx], "monto": mejor["monto"]}

    total_categorias = sum(float(c["monto"]) for c in categorias) or 1.0
    categorias_out = [
        {
            "nombre": c["nombre"],
            "monto": float(c["monto"]),
            "pct": round(float(c["monto"]) / total_categorias * 100, 1),
        }
        for c in categorias
    ]

    return {
        "fecha": dia.isoformat(),
        "es_hoy": dia == hoy,
        "es_hoy_min": (dia >= hoy),  # deshabilita "siguiente" cuando ya se llegó a hoy
        "etiqueta_fecha": f"{DIAS_CORTOS[indice_dia]} {dia.day} de {MESES_CORTOS[dia.month - 1]}",
        "total_dia": total_dia,
        "vs_promedio_pct": round(vs_promedio_pct, 1),
        "total_semana": total_semana,
        "promedio_dia": round(promedio_dia, 2),
        "vs_semana_anterior_pct": round(vs_semana_anterior_pct, 1),
        "mejor_dia": mejor_dia,
        "serie_semana": serie,
        "categorias": categorias_out,
    }
