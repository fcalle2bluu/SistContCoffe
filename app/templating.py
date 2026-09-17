from pathlib import Path

from fastapi.templating import Jinja2Templates

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=BASE_DIR / "templates")


def formato_hora(iso: str) -> str:
    from datetime import datetime

    return datetime.fromisoformat(str(iso)).strftime("%I:%M %p").lstrip("0")


def formato_fecha_hora(iso: str) -> str:
    from datetime import datetime

    dt = datetime.fromisoformat(str(iso))
    return dt.strftime("%d/%m/%Y %I:%M %p").lstrip("0").replace(" 0", " ")


def formato_fecha(iso: str) -> str:
    y, m, d = str(iso).split("-")[:3]
    d = d[:2]
    return f"{d}/{m}/{y}"


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
