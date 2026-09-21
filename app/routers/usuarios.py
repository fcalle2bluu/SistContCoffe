from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_admin
from app.templating import templates

router = APIRouter(prefix="/dashboard/usuarios")

ROLES = ("admin", "cajero", "otro")


async def _usuarios_context(session: dict, error: str | None = None, editando_id: int | None = None) -> dict:
    usuarios = await pool().fetch(
        "SELECT id, username, nombre, role, created_at FROM usuarios ORDER BY id"
    )
    return {
        "session": session,
        "active": "usuarios",
        "usuarios": usuarios,
        "roles": ROLES,
        "error": error,
        "editando_id": editando_id,
    }


@router.get("", response_class=HTMLResponse)
async def usuarios_page(request: Request, session: dict = Depends(require_admin), editar: int | None = None):
    ctx = await _usuarios_context(session, editando_id=editar)
    return templates.TemplateResponse(request, "dashboard/usuarios.html", ctx)


@router.post("", response_class=HTMLResponse)
async def crear_usuario(
    request: Request,
    session: dict = Depends(require_admin),
    username: str = Form(""),
    nombre: str = Form(""),
    password: str = Form(""),
    role: str = Form(""),
):
    username = username.strip().lower()
    nombre = nombre.strip()
    password = password.strip()

    error = None
    if not username or not nombre or not password or role not in ROLES:
        error = "Completa usuario, nombre, contraseña y un rol válido."

    if not error:
        existe = await pool().fetchval("SELECT 1 FROM usuarios WHERE username = $1", username)
        if existe:
            error = f'Ya existe un usuario con el nombre de usuario "{username}".'

    if error:
        ctx = await _usuarios_context(session, error=error)
        return templates.TemplateResponse(request, "dashboard/usuarios.html", ctx, status_code=400)

    await pool().execute(
        "INSERT INTO usuarios (username, password, role, nombre) VALUES ($1, $2, $3, $4)",
        username, password, role, nombre,
    )
    await bitacora.registrar(session, "Creó usuario", f"{username} — {nombre} ({role})")
    return RedirectResponse("/dashboard/usuarios", status_code=303)


@router.post("/{usuario_id}/editar", response_class=HTMLResponse)
async def editar_usuario(
    request: Request,
    usuario_id: int,
    session: dict = Depends(require_admin),
    nombre: str = Form(""),
    password: str = Form(""),
    role: str = Form(""),
):
    nombre = nombre.strip()
    password = password.strip()

    error = None
    if not nombre or role not in ROLES:
        error = "Completa el nombre y un rol válido."

    objetivo = await pool().fetchrow("SELECT username, role FROM usuarios WHERE id = $1", usuario_id)
    if not objetivo:
        return RedirectResponse("/dashboard/usuarios", status_code=303)

    if not error and objetivo["role"] == "admin" and role != "admin":
        otros_admins = await pool().fetchval(
            "SELECT COUNT(*) FROM usuarios WHERE role = 'admin' AND id != $1", usuario_id
        )
        if otros_admins == 0:
            error = "No puedes quitarle el rol admin al único administrador que queda."

    if error:
        ctx = await _usuarios_context(session, error=error, editando_id=usuario_id)
        return templates.TemplateResponse(request, "dashboard/usuarios.html", ctx, status_code=400)

    if password:
        await pool().execute(
            "UPDATE usuarios SET nombre = $1, role = $2, password = $3 WHERE id = $4",
            nombre, role, password, usuario_id,
        )
        detalle = f"{objetivo['username']}: nombre/rol actualizados, contraseña cambiada"
    else:
        await pool().execute(
            "UPDATE usuarios SET nombre = $1, role = $2 WHERE id = $3", nombre, role, usuario_id
        )
        detalle = f"{objetivo['username']}: nombre/rol actualizados"

    await bitacora.registrar(session, "Editó usuario", detalle)
    return RedirectResponse("/dashboard/usuarios", status_code=303)


@router.post("/{usuario_id}/eliminar", response_class=HTMLResponse)
async def eliminar_usuario(request: Request, usuario_id: int, session: dict = Depends(require_admin)):
    if usuario_id == session["id"]:
        ctx = await _usuarios_context(session, error="No puedes eliminar tu propia cuenta.")
        return templates.TemplateResponse(request, "dashboard/usuarios.html", ctx, status_code=400)

    objetivo = await pool().fetchrow("SELECT username, role FROM usuarios WHERE id = $1", usuario_id)
    if objetivo:
        if objetivo["role"] == "admin":
            otros_admins = await pool().fetchval(
                "SELECT COUNT(*) FROM usuarios WHERE role = 'admin' AND id != $1", usuario_id
            )
            if otros_admins == 0:
                ctx = await _usuarios_context(
                    session, error="No puedes eliminar al único administrador que queda."
                )
                return templates.TemplateResponse(request, "dashboard/usuarios.html", ctx, status_code=400)
        await pool().execute("DELETE FROM usuarios WHERE id = $1", usuario_id)
        await bitacora.registrar(session, "Eliminó usuario", f"{objetivo['username']} ({objetivo['role']})")
    return RedirectResponse("/dashboard/usuarios", status_code=303)
