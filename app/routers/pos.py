from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse

from app.deps import require_session
from app.templating import templates

router = APIRouter()


@router.get("/pos", response_class=HTMLResponse)
async def pos_page(request: Request, session: dict = Depends(require_session)):
    return templates.TemplateResponse(request, "pos.html", {"session": session})
