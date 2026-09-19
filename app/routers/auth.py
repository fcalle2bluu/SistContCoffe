import json
from datetime import timedelta

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import get_session, require_dashboard
from app.session import clear_session_cookie, set_session_cookie
from app.templating import templates
from app.tz import ahora_bolivia

router = APIRouter()


def role_home(role: str) -> str:
    return "/dashboard/ventas" if role == "cajero" else "/dashboard"


@router.get("/", response_class=HTMLResponse)
async def login_page(request: Request):
    session = get_session(request)
    if session:
        return RedirectResponse(role_home(session["role"]), status_code=303)
    return templates.TemplateResponse(request, "login.html", {"error": None})


@router.post("/login", response_class=HTMLResponse)
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    username = username.strip().lower()
    password = password.strip()

    if not username or not password:
        return templates.TemplateResponse(
            request, "login.html", {"error": "Ingresa usuario y contraseña."}, status_code=400
        )

    row = await pool().fetchrow(
        "SELECT id, username, nombre, role, password FROM usuarios WHERE username = $1", username
    )
    if row is None or row["password"] != password:
        return templates.TemplateResponse(
            request, "login.html", {"error": "Usuario o contraseña incorrectos."}, status_code=400
        )

    user = {"id": row["id"], "username": row["username"], "nombre": row["nombre"], "role": row["role"]}
    await bitacora.registrar(user, "Inició sesión")
    response = RedirectResponse(role_home(user["role"]), status_code=303)
    set_session_cookie(response, user)
    return response


@router.post("/logout")
async def logout(session: dict | None = Depends(get_session)):
    if session:
        await bitacora.registrar(session, "Cerró sesión")
    response = RedirectResponse("/", status_code=303)
    clear_session_cookie(response)
    return response


async def _datos_dashboard() -> dict:
    total_hoy = await pool().fetchval(
        "SELECT COALESCE(SUM(total), 0) FROM ordenes WHERE estado = 'cobrada' "
        "AND (cobrado_en AT TIME ZONE 'America/La_Paz')::date = (now() AT TIME ZONE 'America/La_Paz')::date"
    )
    total_mes = await pool().fetchval(
        "SELECT COALESCE(SUM(total), 0) FROM ordenes WHERE estado = 'cobrada' "
        "AND date_trunc('month', cobrado_en AT TIME ZONE 'America/La_Paz') "
        "= date_trunc('month', now() AT TIME ZONE 'America/La_Paz')"
    )
    egresos_caja_mes = await pool().fetchval(
        "SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja WHERE tipo = 'egreso' "
        "AND date_trunc('month', creado_en AT TIME ZONE 'America/La_Paz') "
        "= date_trunc('month', now() AT TIME ZONE 'America/La_Paz')"
    )
    compras_insumos_mes = await pool().fetchval(
        "SELECT COALESCE(SUM(total), 0) FROM compras_insumos "
        "WHERE date_trunc('month', fecha) = date_trunc('month', (now() AT TIME ZONE 'America/La_Paz')::date)"
    )
    total_productos = await pool().fetchval("SELECT COUNT(*) FROM productos")
    total_clientes = await pool().fetchval("SELECT COUNT(*) FROM clientes")

    filas_semana = await pool().fetch(
        "SELECT (cobrado_en AT TIME ZONE 'America/La_Paz')::date AS dia, SUM(total) AS total "
        "FROM ordenes WHERE estado = 'cobrada' AND cobrado_en >= now() - interval '7 days' "
        "GROUP BY dia"
    )
    por_dia = {f["dia"]: float(f["total"]) for f in filas_semana}
    hoy_local = ahora_bolivia().date()
    semana_labels, semana_datos = [], []
    for i in range(6, -1, -1):
        dia = hoy_local - timedelta(days=i)
        semana_labels.append(dia.strftime("%d/%m"))
        semana_datos.append(por_dia.get(dia, 0.0))

    top_productos = await pool().fetch(
        "SELECT oi.producto_nombre, SUM(oi.cantidad) AS cantidad "
        "FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id "
        "WHERE o.estado = 'cobrada' AND o.cobrado_en >= now() - interval '30 days' "
        "GROUP BY oi.producto_nombre ORDER BY cantidad DESC LIMIT 8"
    )
    por_categoria = await pool().fetch(
        "SELECT p.categoria, SUM(oi.cantidad * oi.precio_unitario) AS total "
        "FROM orden_items oi JOIN ordenes o ON o.id = oi.orden_id "
        "LEFT JOIN productos p ON p.id = oi.producto_id "
        "WHERE o.estado = 'cobrada' AND o.cobrado_en >= now() - interval '30 days' "
        "GROUP BY p.categoria ORDER BY total DESC"
    )
    metodos_pago = await pool().fetch(
        "SELECT tipo_pago, SUM(total) AS monto FROM ordenes "
        "WHERE estado = 'cobrada' AND cobrado_en >= now() - interval '30 days' AND tipo_pago IS NOT NULL "
        "GROUP BY tipo_pago ORDER BY monto DESC"
    )

    return {
        "kpi_ventas_hoy": float(total_hoy),
        "kpi_ventas_mes": float(total_mes),
        "kpi_gastos_mes": float(egresos_caja_mes) + float(compras_insumos_mes),
        "kpi_productos": total_productos,
        "kpi_clientes": total_clientes,
        "semana_labels": json.dumps(semana_labels),
        "semana_datos": json.dumps(semana_datos),
        "top_productos_labels": json.dumps([r["producto_nombre"] for r in top_productos]),
        "top_productos_datos": json.dumps([float(r["cantidad"]) for r in top_productos]),
        "categorias_labels": json.dumps([r["categoria"] or "Otros" for r in por_categoria]),
        "categorias_datos": json.dumps([float(r["total"]) for r in por_categoria]),
        "pago_labels": json.dumps([r["tipo_pago"] for r in metodos_pago]),
        "pago_datos": json.dumps([float(r["monto"]) for r in metodos_pago]),
    }


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_home(request: Request, session: dict = Depends(require_dashboard)):
    datos = await _datos_dashboard()
    return templates.TemplateResponse(
        request, "dashboard/home.html", {"session": session, "active": "home", **datos}
    )
