from datetime import datetime
from pathlib import Path

from fastapi.templating import Jinja2Templates

from app.tz import BOLIVIA_TZ

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=BASE_DIR / "templates")

_style_path = BASE_DIR / "static" / "style.css"
templates.env.globals["style_version"] = int(_style_path.stat().st_mtime)


def _a_hora_bolivia(iso) -> datetime:
    dt = datetime.fromisoformat(str(iso))
    if dt.tzinfo is not None:
        dt = dt.astimezone(BOLIVIA_TZ)
    return dt


def formato_hora(iso: str) -> str:
    return _a_hora_bolivia(iso).strftime("%I:%M %p").lstrip("0")


def formato_fecha_hora(iso: str) -> str:
    dt = _a_hora_bolivia(iso)
    return dt.strftime("%d/%m/%Y %I:%M %p").lstrip("0").replace(" 0", " ")


def formato_fecha(iso: str) -> str:
    y, m, d = str(iso).split("-")[:3]
    d = d[:2]
    return f"{d}/{m}/{y}"


MESES_ES = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
]


def formato_datetime_local(iso: str) -> str:
    """Formatea para el value de un <input type="datetime-local"> (sin zona,
    en hora de Bolivia), usado en los formularios de corregir la hora."""
    return _a_hora_bolivia(iso).strftime("%Y-%m-%dT%H:%M")


def formato_ticket_fecha(iso: str) -> str:
    dt = _a_hora_bolivia(iso)
    fecha = dt.strftime("%d/%m/%y")
    hora = dt.strftime("%H:%M")
    if hora.startswith("0"):
        hora = hora[1:]
    return f"{fecha} {hora}"


def formato_mes_anio(iso: str) -> str:
    dt = _a_hora_bolivia(iso)
    return f"{MESES_ES[dt.month - 1]} {dt.year}"


def formato_bs(value) -> str:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return str(value)
    signo = "-" if num < 0 else ""
    texto = f"{abs(num):,.2f}"
    texto = texto.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{signo}{texto}"


templates.env.filters["hora"] = formato_hora
templates.env.filters["fechahora"] = formato_fecha_hora
templates.env.filters["fecha"] = formato_fecha
templates.env.filters["bs"] = formato_bs
templates.env.filters["ticket_fecha"] = formato_ticket_fecha
templates.env.filters["datetime_local"] = formato_datetime_local
templates.env.filters["mes_anio"] = formato_mes_anio
