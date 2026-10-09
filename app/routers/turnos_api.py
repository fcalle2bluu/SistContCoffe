"""API JSON de solo lectura para Control de Turnos, usada por la app móvil.

Reimplementa las mismas consultas que app/routers/turnos.py (que arma HTML
para el sistema web) pero devolviendo JSON, para no tocar esa ruta ya
probada en producción. Se deja fuera el detalle contable más fino (asientos
de Libro Diario y arqueo por denominación) — eso queda solo en el sistema
web; acá se muestra el resumen operativo (ventas, pagos, movimientos de
caja) que es lo que hace falta para un vistazo rápido desde el celular.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.db import pool
from app.deps import require_admin
from app.routers.turnos import NUMERO_TURNO_MES_SQL
from app.routers.ventas import _efectivo_teorico_turno

router = APIRouter(prefix="/api/turnos")


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


@router.get("")
async def turnos_lista(session: dict = Depends(require_admin)):
    turnos = await pool().fetch(
        f"""
        SELECT t.id, t.responsable, t.estado, t.monto_inicial, t.monto_final_declarado,
               t.abierto_en, t.cerrado_en,
               {NUMERO_TURNO_MES_SQL} AS numero,
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
    return JSONResponse(
        [
            {
                "id": t["id"],
                "numero": t["numero"],
                "responsable": t["responsable"],
                "estado": t["estado"],
                "monto_inicial": float(t["monto_inicial"]),
                "monto_final_declarado": (
                    float(t["monto_final_declarado"]) if t["monto_final_declarado"] is not None else None
                ),
                "abierto_en": _iso(t["abierto_en"]),
                "cerrado_en": _iso(t["cerrado_en"]),
                "cantidad_ventas": t["cantidad_ventas"],
                "total_ventas": float(t["total_ventas"]),
                "cantidad_movimientos": t["cantidad_movimientos"],
            }
            for t in turnos
        ]
    )


@router.get("/{turno_id}")
async def turno_detalle_api(turno_id: int, session: dict = Depends(require_admin)):
    turno = await pool().fetchrow("SELECT * FROM turnos WHERE id = $1", turno_id)
    if not turno:
        return JSONResponse({"error": "Turno no encontrado."}, status_code=404)

    ordenes = await pool().fetch(
        "SELECT id, mesa, estado, total, tipo_pago, responsable, creado_en, cobrado_en FROM ordenes "
        "WHERE turno_id = $1 ORDER BY creado_en",
        turno_id,
    )
    movimientos = await pool().fetch(
        "SELECT id, tipo, monto, motivo, tipo_pago, categoria, responsable, creado_en FROM movimientos_caja "
        "WHERE turno_id = $1 ORDER BY creado_en",
        turno_id,
    )
    egresos_lista = [m for m in movimientos if m["tipo"] == "egreso"]
    ingresos_lista = [m for m in movimientos if m["tipo"] == "ingreso"]
    reposiciones_lista = [m for m in movimientos if m["tipo"] == "reposicion"]
    ventas_totales = sum(float(o["total"]) for o in ordenes if o["estado"] == "cobrada")
    egresos_totales = sum(float(m["monto"]) for m in egresos_lista)
    ingresos_caja_totales = sum(float(m["monto"]) for m in ingresos_lista)
    reposiciones_totales = sum(float(m["monto"]) for m in reposiciones_lista)

    pago_rows = await pool().fetch(
        "SELECT op.tipo_pago, COUNT(*) AS cantidad, SUM(op.monto) AS monto FROM orden_pagos op "
        "JOIN ordenes o ON o.id = op.orden_id WHERE o.turno_id = $1 GROUP BY op.tipo_pago",
        turno_id,
    )
    resumen_pagos = {
        (r["tipo_pago"] or "—"): {"cantidad": r["cantidad"], "monto": float(r["monto"])} for r in pago_rows
    }

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

    return JSONResponse(
        {
            "turno": {
                "id": turno["id"],
                "responsable": turno["responsable"],
                "estado": turno["estado"],
                "monto_inicial": float(turno["monto_inicial"]),
                "monto_final_declarado": (
                    float(turno["monto_final_declarado"]) if turno["monto_final_declarado"] is not None else None
                ),
                "abierto_en": _iso(turno["abierto_en"]),
                "cerrado_en": _iso(turno["cerrado_en"]),
            },
            "resumen": {
                "ventas_totales": ventas_totales,
                "egresos_totales": egresos_totales,
                "ingresos_caja_totales": ingresos_caja_totales,
                "reposiciones_totales": reposiciones_totales,
                "efectivo_teorico": teorico,
                "estado_arqueo": estado_arqueo,
                "diferencia_arqueo": abs(diferencia_arqueo),
            },
            "resumen_pagos": resumen_pagos,
            "ordenes": [
                {
                    "id": o["id"],
                    "mesa": o["mesa"],
                    "estado": o["estado"],
                    "total": float(o["total"]),
                    "tipo_pago": o["tipo_pago"],
                    "responsable": o["responsable"],
                    "hora": _iso(o["cobrado_en"] or o["creado_en"]),
                }
                for o in ordenes
            ],
            "movimientos": [
                {
                    "id": m["id"],
                    "tipo": m["tipo"],
                    "monto": float(m["monto"]),
                    "motivo": m["motivo"],
                    "tipo_pago": m["tipo_pago"],
                    "categoria": m["categoria"],
                    "responsable": m["responsable"],
                    "hora": _iso(m["creado_en"]),
                }
                for m in movimientos
            ],
        }
    )
