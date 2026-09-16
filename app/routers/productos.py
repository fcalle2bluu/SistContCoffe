from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.db import pool
from app.deps import require_admin, require_dashboard
from app.templating import templates

router = APIRouter(prefix="/dashboard/productos")

SELECT_PRODUCTOS = "SELECT id, nombre, categoria, precio_venta FROM productos ORDER BY categoria, nombre"


async def _agrupados():
    productos = await pool().fetch(SELECT_PRODUCTOS)
    por_categoria: dict[str, list] = {}
    for p in productos:
        por_categoria.setdefault(p["categoria"], []).append(p)
    categorias = sorted({p["categoria"] for p in productos})
    return productos, por_categoria, categorias


@router.get("", response_class=HTMLResponse)
async def productos_page(
    request: Request, session: dict = Depends(require_dashboard), edit: int | None = None, error: str | None = None
):
    productos, por_categoria, categorias = await _agrupados()
    return templates.TemplateResponse(
        request,
        "dashboard/productos.html",
        {
            "session": session,
            "active": "productos",
            "por_categoria": por_categoria,
            "categorias": categorias,
            "editing_id": edit,
            "error": error,
        },
    )


@router.post("", response_class=HTMLResponse)
async def crear_producto(
    request: Request,
    session: dict = Depends(require_admin),
    nombre: str = Form(""),
    categoria: str = Form(""),
    precio_venta: str = Form(""),
):
    nombre, categoria = nombre.strip(), categoria.strip()
    try:
        precio = float(precio_venta)
    except ValueError:
        precio = None

    if not nombre or not categoria or precio is None:
        _, por_categoria, categorias = await _agrupados()
        return templates.TemplateResponse(
            request,
            "dashboard/productos.html",
            {
                "session": session,
                "active": "productos",
                "por_categoria": por_categoria,
                "categorias": categorias,
                "editing_id": None,
                "error": "Completa nombre, categoría y precio.",
            },
            status_code=400,
        )

    await pool().execute(
        "INSERT INTO productos (nombre, categoria, precio_venta, es_inventariable) VALUES ($1, $2, $3, false)",
        nombre,
        categoria,
        precio,
    )
    return RedirectResponse("/dashboard/productos", status_code=303)


@router.post("/{producto_id}", response_class=HTMLResponse)
async def actualizar_producto(
    request: Request,
    producto_id: int,
    session: dict = Depends(require_admin),
    nombre: str = Form(""),
    categoria: str = Form(""),
    precio_venta: str = Form(""),
):
    nombre, categoria = nombre.strip(), categoria.strip()
    try:
        precio = float(precio_venta)
    except ValueError:
        precio = None

    if not nombre or not categoria or precio is None:
        _, por_categoria, categorias = await _agrupados()
        return templates.TemplateResponse(
            request,
            "dashboard/productos.html",
            {
                "session": session,
                "active": "productos",
                "por_categoria": por_categoria,
                "categorias": categorias,
                "editing_id": producto_id,
                "error": "Datos inválidos.",
            },
            status_code=400,
        )

    await pool().execute(
        "UPDATE productos SET nombre = $1, categoria = $2, precio_venta = $3 WHERE id = $4",
        nombre,
        categoria,
        precio,
        producto_id,
    )
    return RedirectResponse("/dashboard/productos", status_code=303)


@router.post("/{producto_id}/eliminar")
async def eliminar_producto(producto_id: int, session: dict = Depends(require_admin)):
    await pool().execute("DELETE FROM productos WHERE id = $1", producto_id)
    return RedirectResponse("/dashboard/productos", status_code=303)
