from fastapi import APIRouter
from fastapi.responses import RedirectResponse

router = APIRouter()


@router.get("/pos")
async def pos_page():
    return RedirectResponse("/dashboard/ventas", status_code=303)
