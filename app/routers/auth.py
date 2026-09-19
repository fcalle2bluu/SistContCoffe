from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import get_session, require_dashboard
from app.session import clear_session_cookie, set_session_cookie
from app.templating import templates

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

    return {
        "kpi_ventas_hoy": float(total_hoy),
        "kpi_ventas_mes": float(total_mes),
        "kpi_gastos_mes": float(egresos_caja_mes) + float(compras_insumos_mes),
        "kpi_productos": total_productos,
        "kpi_clientes": total_clientes,
    }


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_home(request: Request, session: dict = Depends(require_dashboard)):
    datos = await _datos_dashboard()
    return templates.TemplateResponse(
        request, "dashboard/home.html", {"session": session, "active": "home", **datos}
    )
