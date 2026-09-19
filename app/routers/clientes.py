from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_dashboard, require_session
from app.templating import templates

router = APIRouter(prefix="/dashboard/clientes")


@router.get("", response_class=HTMLResponse)
async def clientes_page(request: Request, session: dict = Depends(require_dashboard), error: str | None = None):
    clientes = await pool().fetch("SELECT id, nombre, ci_nit, telefono FROM clientes ORDER BY nombre")
    return templates.TemplateResponse(
        request,
        "dashboard/clientes.html",
        {"session": session, "active": "clientes", "clientes": clientes, "error": error},
    )


@router.post("", response_class=HTMLResponse)
async def crear_cliente(
    request: Request,
    session: dict = Depends(require_session),
    nombre: str = Form(""),
    ci_nit: str = Form(""),
    telefono: str = Form(""),
):
    nombre = nombre.strip()
    if not nombre:
        clientes = await pool().fetch("SELECT id, nombre, ci_nit, telefono FROM clientes ORDER BY nombre")
        return templates.TemplateResponse(
            request,
            "dashboard/clientes.html",
            {
                "session": session,
                "active": "clientes",
                "clientes": clientes,
                "error": "El nombre / razón social es obligatorio.",
            },
            status_code=400,
        )

    await pool().execute(
        "INSERT INTO clientes (nombre, ci_nit, telefono) VALUES ($1, $2, $3)",
        nombre,
        ci_nit.strip() or None,
        telefono.strip() or None,
    )
    await bitacora.registrar(session, "Creó cliente", nombre)
    return RedirectResponse("/dashboard/clientes", status_code=303)


@router.post("/{cliente_id}/eliminar")
async def eliminar_cliente(cliente_id: int, session: dict = Depends(require_session)):
    await pool().execute("DELETE FROM clientes WHERE id = $1", cliente_id)
    await bitacora.registrar(session, "Eliminó cliente", f"Cliente #{cliente_id}")
    return RedirectResponse("/dashboard/clientes", status_code=303)
