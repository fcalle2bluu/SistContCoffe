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


templates.env.filters["hora"] = formato_hora
templates.env.filters["fechahora"] = formato_fecha_hora
templates.env.filters["fecha"] = formato_fecha
