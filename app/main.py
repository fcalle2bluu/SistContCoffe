from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.db import close_pool, init_pool
from app.deps import RedirectTo
from app.routers import (
    auth,
    bitacora,
    clientes,
    contabilidad,
    dashboard_api,
    insumos,
    inventario_peps,
    pos,
    productos,
    turnos,
    usuarios,
    ventas,
)

BASE_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.middleware("http")
async def _no_cache_dashboard(request: Request, call_next):
    """Evita que el navegador guarde en caché las páginas del dashboard/POS.
    Sin esto, al apretar "atrás" después de una acción que cambia el estado
    (p. ej. cerrar turno) el navegador puede mostrar la página vieja desde su
    caché en vez de pedirla de nuevo, dejando ver datos que ya no son
    válidos."""
    response = await call_next(request)
    if request.method == "GET" and request.url.path.startswith(("/dashboard", "/pos")):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


@app.exception_handler(RedirectTo)
async def _redirect_to(request: Request, exc: RedirectTo):
    return RedirectResponse(exc.path, status_code=303)


app.include_router(auth.router)
app.include_router(ventas.router)
app.include_router(insumos.router)
app.include_router(inventario_peps.router)
app.include_router(clientes.router)
app.include_router(productos.router)
app.include_router(contabilidad.router)
app.include_router(bitacora.router)
app.include_router(turnos.router)
app.include_router(usuarios.router)
app.include_router(dashboard_api.router)
app.include_router(pos.router)
