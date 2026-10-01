from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse

from app import bitacora
from app.db import pool
from app.deps import require_session
from app.templating import templates

router = APIRouter(prefix="/dashboard/cocina")
router_api = APIRouter()

# Solo los pedidos con productos de estas categorías hacen sonar la alarma de
# Cocina (lo demás lo prepara la barra).
CATEGORIAS_COCINA = ("COMIDA", "PASTELERÍA")
# Un llamado sin respuesta deja de mostrarse/sonar pasado este tiempo.
MINUTOS_LLAMADO = 10


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
            "SELECT oi.orden_id, oi.producto_nombre, oi.cantidad, "
            "COALESCE(UPPER(p.categoria) = ANY($2::text[]), false) AS es_cocina "
            "FROM orden_items oi LEFT JOIN productos p ON p.id = oi.producto_id "
            "WHERE oi.orden_id = ANY($1::int[]) AND oi.precio_unitario >= 0 ORDER BY oi.id",
            [o["id"] for o in ordenes], list(CATEGORIAS_COCINA),
        )
        for r in item_rows:
            items_por_orden.setdefault(r["orden_id"], []).append(r)
    return [
        {
            "orden": o,
            "productos": items_por_orden.get(o["id"], []),
            "cant_cocina": sum(float(it["cantidad"]) for it in items_por_orden.get(o["id"], []) if it["es_cocina"]),
        }
        for o in ordenes
    ]


@router.get("", response_class=HTMLResponse)
async def cocina_page(request: Request, session: dict = Depends(require_session)):
    pedidos = await _pedidos_cocina()
    llamados = await _llamados_pendientes()
    return templates.TemplateResponse(
        request, "dashboard/cocina.html",
        {"session": session, "active": "cocina", "pedidos": pedidos, "llamados": llamados},
    )


@router.get("/feed", response_class=HTMLResponse)
async def cocina_feed(request: Request, session: dict = Depends(require_session)):
    pedidos = await _pedidos_cocina()
    llamados = await _llamados_pendientes()
    return templates.TemplateResponse(
        request, "partials/_cocina_feed.html", {"pedidos": pedidos, "llamados": llamados}
    )


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
                "cant_cocina": p["cant_cocina"],
                "productos": [
                    {"nombre": it["producto_nombre"], "cantidad": float(it["cantidad"]), "cocina": it["es_cocina"]}
                    for it in p["productos"]
                ],
            }
        )
    return resultado


@router_api.get("/api/cocina/pedidos")
async def cocina_pedidos_api(session: dict = Depends(require_session)):
    pedidos = await _pedidos_cocina()
    return JSONResponse(_serializar_pedidos(pedidos))


# --- Llamar a cocina -------------------------------------------------------
# El cajero aprieta "Llamar a cocina" en la web; la app (y la pantalla web de
# Cocina) suenan y muestran el aviso; quien lo ve aprieta "Ya voy" y la caja
# ve quién viene.


async def _llamados_pendientes() -> list:
    return await pool().fetch(
        "SELECT id, llamado_por, creado_en FROM llamados_cocina "
        "WHERE visto_en IS NULL AND NOT cancelado AND creado_en > now() - make_interval(mins => $1) "
        "ORDER BY id",
        MINUTOS_LLAMADO,
    )


async def _ultimo_llamado(nombre: str):
    """El último llamado hecho por esta persona que todavía vale la pena
    mostrarle en la caja: esperando respuesta, o respondido hace menos de
    un minuto."""
    return await pool().fetchrow(
        "SELECT id, creado_en, visto_por, visto_en FROM llamados_cocina "
        "WHERE llamado_por = $1 AND NOT cancelado AND ("
        "  (visto_en IS NULL AND creado_en > now() - make_interval(mins => $2)) "
        "  OR visto_en > now() - interval '60 seconds') "
        "ORDER BY id DESC LIMIT 1",
        nombre, MINUTOS_LLAMADO,
    )


def _widget_llamar(request: Request, llamado):
    return templates.TemplateResponse(request, "partials/_llamar_cocina.html", {"llamado": llamado})


@router.get("/llamado", response_class=HTMLResponse)
async def estado_llamado(request: Request, session: dict = Depends(require_session)):
    return _widget_llamar(request, await _ultimo_llamado(session["nombre"]))


@router.post("/llamar", response_class=HTMLResponse)
async def llamar_cocina(request: Request, session: dict = Depends(require_session)):
    llamado = await _ultimo_llamado(session["nombre"])
    if llamado is None or llamado["visto_en"] is not None:
        await pool().execute("INSERT INTO llamados_cocina (llamado_por) VALUES ($1)", session["nombre"])
        await bitacora.registrar(session, "Llamó a cocina", "")
    return _widget_llamar(request, await _ultimo_llamado(session["nombre"]))


@router.post("/llamar/{llamado_id}/cancelar", response_class=HTMLResponse)
async def cancelar_llamado(request: Request, llamado_id: int, session: dict = Depends(require_session)):
    await pool().execute(
        "UPDATE llamados_cocina SET cancelado = true WHERE id = $1 AND visto_en IS NULL", llamado_id
    )
    return _widget_llamar(request, None)


async def _marcar_visto(llamado_id: int, nombre: str) -> None:
    await pool().execute(
        "UPDATE llamados_cocina SET visto_por = $2, visto_en = now() WHERE id = $1 AND visto_en IS NULL",
        llamado_id, nombre,
    )


@router.post("/llamar/{llamado_id}/visto", response_class=HTMLResponse)
async def llamado_visto_web(request: Request, llamado_id: int, session: dict = Depends(require_session)):
    await _marcar_visto(llamado_id, session["nombre"])
    return HTMLResponse("")


@router_api.get("/api/cocina/llamados")
async def llamados_api(session: dict = Depends(require_session)):
    return JSONResponse([
        {"id": l["id"], "llamado_por": l["llamado_por"], "creado_en": l["creado_en"].isoformat()}
        for l in await _llamados_pendientes()
    ])


@router_api.post("/api/cocina/llamados/{llamado_id}/visto")
async def llamado_visto_api(llamado_id: int, session: dict = Depends(require_session)):
    await _marcar_visto(llamado_id, session["nombre"])
    return JSONResponse({"ok": True})
