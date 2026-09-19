from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse

from app.db import pool
from app.deps import require_admin
from app.templating import templates

router = APIRouter(prefix="/dashboard/bitacora")

LIMITE = 300


@router.get("", response_class=HTMLResponse)
async def bitacora_page(request: Request, session: dict = Depends(require_admin)):
    total = await pool().fetchval("SELECT COUNT(*) FROM bitacora")
    movimientos = await pool().fetch(
        "SELECT usuario, rol, accion, detalle, creado_en FROM bitacora ORDER BY creado_en DESC, id DESC LIMIT $1",
        LIMITE,
    )
    return templates.TemplateResponse(
        request,
        "dashboard/bitacora.html",
        {
            "session": session,
            "active": "bitacora",
            "movimientos": movimientos,
            "total": total,
            "limite": LIMITE,
        },
    )
