from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.db import pool
from app.deps import get_session, require_dashboard
from app.session import clear_session_cookie, set_session_cookie
from app.templating import templates

router = APIRouter()


def role_home(role: str) -> str:
    return "/pos" if role == "cajero" else "/dashboard"


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
    response = RedirectResponse(role_home(user["role"]), status_code=303)
    set_session_cookie(response, user)
    return response


@router.post("/logout")
async def logout():
    response = RedirectResponse("/", status_code=303)
    clear_session_cookie(response)
    return response


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_home(request: Request, session: dict = Depends(require_dashboard)):
    return templates.TemplateResponse(
        request, "dashboard/home.html", {"session": session, "active": "home"}
    )
