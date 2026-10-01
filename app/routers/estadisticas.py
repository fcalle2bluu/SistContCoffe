from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse

from app.db import pool
from app.deps import require_admin
from app.routers.dashboard_api import ES_AJUSTE
from app.templating import MESES_ES, templates
from app.tz import BOLIVIA_TZ, hoy_bolivia

router = APIRouter(prefix="/dashboard/estadisticas")

# Franjas horarias del reporte (7AM a 9PM), igual que en el Excel del
# contador — fuera de ese rango el local no suele estar abierto.
HORAS_RANGO = list(range(7, 21))


def _mes(mes: str | None) -> dict:
    """Mes que se está viendo ("2026-09"); si no viene o no es válido, el
    mes actual. `fin` es el primer día del mes siguiente (exclusivo)."""
    hoy = hoy_bolivia()
    try:
        anio, num = (int(x) for x in mes.split("-"))
        inicio = date(anio, num, 1)
    except (AttributeError, ValueError):
        inicio = hoy.replace(day=1)
    fin = (inicio + timedelta(days=32)).replace(day=1)
    anterior = (inicio - timedelta(days=1)).replace(day=1)
    return {
        "valor": f"{inicio:%Y-%m}",
        "nombre": f"{MESES_ES[inicio.month - 1].capitalize()} {inicio.year}",
        "inicio": inicio,
        "fin": fin,
        "anterior": f"{anterior:%Y-%m}",
        "siguiente": f"{fin:%Y-%m}",
        "es_actual": inicio == hoy.replace(day=1),
        "dia": None,
    }


def _hora_12(hora: int) -> str:
    ampm = "AM" if hora < 12 else "PM"
    hora12 = hora % 12 or 12
    return f"{hora12}{ampm}"


async def _ventas_mes(inicio: date, fin: date) -> list:
    """Mismo criterio que usa el Dashboard para sus gráficos de categoría/
    producto (_consultas_resumen en dashboard_api): excluye Ajustes
    (descuentos/correcciones, no son productos vendidos de verdad)."""
    desde = datetime.combine(inicio, time.min, BOLIVIA_TZ)
    hasta = datetime.combine(fin, time.min, BOLIVIA_TZ)
    return await pool().fetch(
        "SELECT oi.producto_nombre, oi.cantidad, o.cobrado_en, COALESCE(p.categoria, 'Otros') AS categoria "
        "FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id "
        "LEFT JOIN productos p ON p.id = oi.producto_id "
        f"WHERE o.estado = 'cobrada' AND o.cobrado_en >= $1 AND o.cobrado_en < $2 AND NOT {ES_AJUSTE}",
        desde, hasta,
    )


def _filas_validas(filas, inicio: date, fin: date):
    """Ubica cada línea en su día local (Bolivia), descartando cualquiera
    que por algún motivo caiga fuera del mes pedido."""
    for f in filas:
        dia_local = f["cobrado_en"].astimezone(BOLIVIA_TZ).date()
        if inicio <= dia_local < fin:
            yield f, dia_local


def _agrupar_por_categoria(filas, inicio: date, fin: date) -> list[dict]:
    categorias: dict[str, dict[str, dict]] = {}
    for f, dia_local in _filas_validas(filas, inicio, fin):
        categoria = f["categoria"]
        producto = f["producto_nombre"]
        cantidad = float(f["cantidad"])
        prod = categorias.setdefault(categoria, {}).setdefault(producto, {"total": 0.0, "dias": {}})
        prod["total"] += cantidad
        prod["dias"][dia_local.day] = prod["dias"].get(dia_local.day, 0.0) + cantidad

    resultado = []
    for categoria, productos in categorias.items():
        filas_prod = [
            {"nombre": nombre, "total": p["total"], "dias": p["dias"]}
            for nombre, p in productos.items()
        ]
        filas_prod.sort(key=lambda p: -p["total"])
        resultado.append({
            "nombre": categoria,
            "productos": filas_prod,
            "total": sum(p["total"] for p in filas_prod),
        })
    resultado.sort(key=lambda c: -c["total"])
    return resultado


def _ventas_por_dia(filas, inicio: date, fin: date) -> list[dict]:
    dias = {d.day: 0.0 for d in (inicio + timedelta(days=i) for i in range((fin - inicio).days))}
    for f, dia_local in _filas_validas(filas, inicio, fin):
        dias[dia_local.day] += float(f["cantidad"])
    return [{"dia": d, "cantidad": c} for d, c in sorted(dias.items())]


def _ventas_por_hora(filas, inicio: date, fin: date) -> list[dict]:
    horas = {h: 0.0 for h in HORAS_RANGO}
    for f, _ in _filas_validas(filas, inicio, fin):
        hora = f["cobrado_en"].astimezone(BOLIVIA_TZ).hour
        if hora in horas:
            horas[hora] += float(f["cantidad"])
    return [{"etiqueta": f"{_hora_12(h)}-{_hora_12(h + 1)}", "cantidad": horas[h]} for h in HORAS_RANGO]


@router.get("", response_class=HTMLResponse)
async def estadisticas_page(request: Request, session: dict = Depends(require_admin), mes: str | None = None):
    m = _mes(mes)
    filas = await _ventas_mes(m["inicio"], m["fin"])
    categorias = _agrupar_por_categoria(filas, m["inicio"], m["fin"])
    dias_mes = list(range(1, (m["fin"] - m["inicio"]).days + 1))
    return templates.TemplateResponse(
        request,
        "dashboard/estadisticas.html",
        {
            "session": session,
            "active": "estadisticas",
            "mes": m,
            "dias_mes": dias_mes,
            "categorias": categorias,
            "total_mes": sum(c["total"] for c in categorias),
            "por_dia": _ventas_por_dia(filas, m["inicio"], m["fin"]),
            "por_hora": _ventas_por_hora(filas, m["inicio"], m["fin"]),
        },
    )
