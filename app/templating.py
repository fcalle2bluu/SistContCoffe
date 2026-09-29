from datetime import datetime
from pathlib import Path
import zlib

from fastapi.templating import Jinja2Templates
from markupsafe import Markup

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


def formato_duracion(segundos) -> str:
    try:
        s = int(segundos)
    except (TypeError, ValueError):
        return "—"
    h, resto = divmod(s, 3600)
    m, sec = divmod(resto, 60)
    return f"{h}h {m:02d}m {sec:02d}s"


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
templates.env.filters["duracion"] = formato_duracion
templates.env.filters["ticket_fecha"] = formato_ticket_fecha
templates.env.filters["datetime_local"] = formato_datetime_local
templates.env.filters["mes_anio"] = formato_mes_anio


# Color de cada cuenta en Contabilidad: así se distingue de un vistazo en el
# Diario y el Mayor adónde entra o de dónde sale la plata. Las cajas tienen
# un color fijo (verde, azul, morado); el resto de las cuentas toma uno de
# CUENTA_COLORES según su código — siempre el mismo para la misma cuenta, y
# distinto para códigos seguidos (p. ej. IT e IT por pagar).
CUENTAS_CAJA = {
    "1110102": "cta-chica",  # Caja Chica — caja del turno
    "1110101": "cta-mn",  # Caja Moneda Nacional — resguardo
    "1110103": "cta-banco",  # Banco BISA
}
CUENTA_COLORES = 7  # cantidad de clases .cta-p0 … .cta-p6 en style.css


def color_cuenta(codigo, clase: str = "cta") -> Markup:
    codigo = str(codigo)
    color = CUENTAS_CAJA.get(codigo)
    if not color:
        n = int(codigo) if codigo.isdigit() else zlib.crc32(codigo.encode())
        color = f"cta-p{n % CUENTA_COLORES}"
    return Markup('class="{} {}"').format(clase, color)


templates.env.globals["color_cuenta"] = color_cuenta
