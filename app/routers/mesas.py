from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse

from app.db import pool
from app.deps import require_session
from app.templating import templates

router = APIRouter(prefix="/dashboard/mesas")

MESA_GRID_COLUMNAS = 4

# Nombres del plano que son zonas/referencias del local, no mesas donde se
# pueda tomar un pedido (p. ej. "BARRA" o "PASILLO" son solo etiquetas de
# ubicación). Se muestran como texto estático en vez de un casillero de color.
MESAS_ETIQUETA = {"EXTERIOR", "BARRA", "PASILLO", "LLEVAR"}


def _mesas_con_layout(mesas) -> list[dict]:
    """Las mesas con posición fija (fila/columna ya cargados en
    mesas_referencia, desde cuando existía el plano editable en Ventas) se
    ubican tal cual, replicando el plano físico del local. Las que todavía
    no tienen posición se acomodan solas en filas nuevas debajo de esas."""
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


def _mesas_ocupadas_info(ordenes_abiertas) -> dict[str, str]:
    """Para cada mesa con una cuenta abierta: desde cuándo está así (la más
    antigua de sus órdenes pendientes), para que el contador arranque desde
    que empezó a esperar el cobro."""
    desde: dict[str, datetime] = {}
    for o in ordenes_abiertas:
        actual = desde.get(o["mesa"])
        if actual is None or o["creado_en"] < actual:
            desde[o["mesa"]] = o["creado_en"]
    return {mesa: dt.isoformat() for mesa, dt in desde.items()}


async def _contexto_mesas() -> dict:
    mesas = _mesas_con_layout(
        await pool().fetch(
            "SELECT id, nombre, fila, columna, ancho, alto FROM mesas_referencia "
            "ORDER BY fila NULLS LAST, columna, nombre"
        )
    )
    ordenes_abiertas = await pool().fetch("SELECT mesa, creado_en FROM ordenes WHERE estado = 'abierta'")
    mesas_ocupadas_desde = _mesas_ocupadas_info(ordenes_abiertas)
    return {
        "mesas": mesas,
        "mesas_ocupadas": list(mesas_ocupadas_desde.keys()),
        "mesas_ocupadas_desde": mesas_ocupadas_desde,
    }


@router.get("", response_class=HTMLResponse)
async def mesas_page(request: Request, session: dict = Depends(require_session)):
    contexto = await _contexto_mesas()
    contexto.update({"session": session, "active": "mesas"})
    return templates.TemplateResponse(request, "dashboard/mesas.html", contexto)


@router.get("/grid", response_class=HTMLResponse)
async def mesas_grid(request: Request, session: dict = Depends(require_session)):
    contexto = await _contexto_mesas()
    return templates.TemplateResponse(request, "partials/_mesa_grid_solo_lectura.html", contexto)
