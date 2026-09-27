from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse

from app.db import pool
from app.deps import require_session
from app.templating import templates

router = APIRouter(prefix="/dashboard/cocina")
router_api = APIRouter()


def _es_htmx(request: Request) -> bool:
    return request.headers.get("HX-Request") == "true"


async def _pedidos_cocina() -> list:
    turno = await pool().fetchrow("SELECT id FROM turnos WHERE estado = 'abierto'")
    if turno:
        ordenes = await pool().fetch(
            "SELECT id, mesa, estado, creado_en, cobrado_en FROM ordenes "
            "WHERE estado = 'abierta' OR (estado = 'cobrada' AND turno_id = $1) "
            "ORDER BY creado_en DESC",
            turno["id"],
        )
    else:
        ordenes = await pool().fetch(
            "SELECT id, mesa, estado, creado_en, cobrado_en FROM ordenes "
            "WHERE estado = 'abierta' ORDER BY creado_en DESC"
        )
    items_por_orden: dict[int, list] = {}
    if ordenes:
        item_rows = await pool().fetch(
            "SELECT orden_id, producto_nombre, cantidad FROM orden_items "
            "WHERE orden_id = ANY($1::int[]) AND precio_unitario >= 0 ORDER BY id",
            [o["id"] for o in ordenes],
        )
        for r in item_rows:
            items_por_orden.setdefault(r["orden_id"], []).append(r)
    return [{"orden": o, "productos": items_por_orden.get(o["id"], [])} for o in ordenes]


@router.get("", response_class=HTMLResponse)
async def cocina_page(request: Request, session: dict = Depends(require_session)):
    pedidos = await _pedidos_cocina()
    return templates.TemplateResponse(
        request, "dashboard/cocina.html", {"session": session, "active": "cocina", "pedidos": pedidos}
    )


@router.get("/feed", response_class=HTMLResponse)
async def cocina_feed(request: Request, session: dict = Depends(require_session)):
    pedidos = await _pedidos_cocina()
    return templates.TemplateResponse(request, "partials/_cocina_feed.html", {"pedidos": pedidos})


def _serializar_pedidos(pedidos: list) -> list:
    resultado = []
    for p in pedidos:
        o = p["orden"]
        pendiente = o["estado"] == "abierta"
        hora = o["creado_en"] if pendiente else o["cobrado_en"]
        resultado.append(
            {
                "id": o["id"],
                "mesa": o["mesa"],
                "pendiente": pendiente,
                "hora": hora.isoformat() if hora else None,
                "productos": [
                    {"nombre": it["producto_nombre"], "cantidad": float(it["cantidad"])}
                    for it in p["productos"]
                ],
            }
        )
    return resultado


@router_api.get("/api/cocina/pedidos")
async def cocina_pedidos_api(session: dict = Depends(require_session)):
    pedidos = await _pedidos_cocina()
    return JSONResponse(_serializar_pedidos(pedidos))
