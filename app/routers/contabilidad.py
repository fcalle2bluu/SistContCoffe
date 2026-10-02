from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_admin
from app.routers.ventas import TIPOS_FACTURADOS, _ordenar_diario, _siguiente_nro_asiento
from app.templating import MESES_ES, templates
from app.tz import BOLIVIA_TZ, hoy_bolivia

router = APIRouter(prefix="/dashboard/contabilidad")

TIPOS_CUENTA = ("ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "EGRESO")


def _mes(mes: str | None, dia: str | None = None) -> dict:
    """Mes que se está viendo en Contabilidad ("2026-09"); si no viene o no
    es válido, el mes actual. `fin` es el primer día del mes siguiente.
    Con `dia` ("2026-09-15") se filtra solo ese día: `desde`/`hasta` (este
    último exclusivo) son el rango a mostrar, el día o el mes completo."""
    hoy = hoy_bolivia()
    try:
        dia_date = date.fromisoformat(dia)
    except (TypeError, ValueError):
        dia_date = None
    try:
        anio, num = (int(x) for x in mes.split("-"))
        inicio = date(anio, num, 1)
    except (AttributeError, ValueError):
        inicio = hoy.replace(day=1)
    if dia_date:
        inicio = dia_date.replace(day=1)
    fin = (inicio + timedelta(days=32)).replace(day=1)
    anterior = (inicio - timedelta(days=1)).replace(day=1)
    return {
        "valor": f"{inicio:%Y-%m}",
        "nombre": f"{MESES_ES[inicio.month - 1].capitalize()} {inicio.year}",
        "inicio": inicio,
        "fin": fin,
        "ultimo_dia": fin - timedelta(days=1),
        "anterior": f"{anterior:%Y-%m}",
        "siguiente": f"{fin:%Y-%m}",
        "es_actual": inicio == hoy.replace(day=1),
        "dia": dia_date.isoformat() if dia_date else None,
        "dia_nombre": f"{dia_date:%d/%m/%Y}" if dia_date else None,
        "desde": dia_date or inicio,
        "hasta": (dia_date + timedelta(days=1)) if dia_date else fin,
    }


def _mes_de(fecha: date) -> str:
    return f"{fecha:%Y-%m}"


def _parse_lineas(cuenta: list[str], lado: list[str], monto: list[str]) -> list[dict]:
    lineas = []
    for c, l, m in zip(cuenta, lado, monto):
        try:
            monto_num = float(m)
        except ValueError:
            continue
        if not c or monto_num <= 0:
            continue
        lineas.append({"codigo_cuenta": c, "lado": l, "monto": monto_num})
    return lineas


# Número de cada asiento DENTRO DE SU MES (1, 2, 3… y vuelve a 1 cada mes),
# que es el que se muestra en el Diario, el Mayor y los PDF. `nro_asiento`
# sigue siendo el número interno único (para editar/eliminar); como el Diario
# está siempre ordenado por fecha, el orden dentro del mes es el mismo.
NUMERO_MES_SQL = """
    LEFT JOIN (
        SELECT nro_asiento, ROW_NUMBER() OVER (
            PARTITION BY date_trunc('month', MIN(fecha)) ORDER BY nro_asiento
        ) AS numero_mes
        FROM libro_diario GROUP BY nro_asiento
    ) nm ON nm.nro_asiento = ld.nro_asiento
"""


async def _filas_libro_diario(mes_ctx: dict, orden: str = "desc") -> list:
    """Líneas del Libro Diario del período (mes o día) que se está viendo.
    `orden` controla si se ve de más reciente a más antiguo ("desc", lo de
    siempre) o al revés ("asc"), según lo que elija el usuario con el botón
    de invertir orden."""
    orden_sql = "ASC" if orden == "asc" else "DESC"
    return await pool().fetch(
        f"""
        SELECT ld.fecha, ld.nro_asiento, nm.numero_mes, ld.codigo_cuenta, cc.nombre AS cuenta_nombre,
               ld.debe, ld.haber, ld.glosa, ld.es_apertura
        FROM libro_diario ld
        LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
        {NUMERO_MES_SQL}
        WHERE ld.fecha >= $1 AND ld.fecha < $2
        ORDER BY ld.fecha {orden_sql}, ld.nro_asiento {orden_sql}, ld.debe = 0, ld.id
        """,
        mes_ctx["desde"], mes_ctx["hasta"],
    )


def _agrupar_asientos(filas) -> list[dict]:
    """Agrupa las líneas del Libro Diario por asiento. `nro` es el número
    real (único en toda la tabla — el que identifica al asiento para
    editarlo o eliminarlo). `numero_mes` es solo para mostrar: el número del
    asiento dentro de SU mes (ver NUMERO_MES_SQL), así cada mes empieza en
    1 aunque se esté viendo un solo día. Las filas tienen que traer la
    columna `numero_mes`."""
    asientos: dict[int, dict] = {}
    for f in filas:
        a = asientos.setdefault(
            f["nro_asiento"],
            {"nro": f["nro_asiento"], "numero_mes": f["numero_mes"], "fecha": f["fecha"], "glosa": f["glosa"],
             "es_apertura": f.get("es_apertura") or False, "lineas": []},
        )
        a["lineas"].append(f)
    for a in asientos.values():
        a["total_debe"] = sum(l["debe"] or 0 for l in a["lineas"])
        a["total_haber"] = sum(l["haber"] or 0 for l in a["lineas"])
    return list(asientos.values())


def _resumen_cuentas(filas) -> list[dict]:
    """Totales por cuenta de las líneas del período que se está viendo: en
    cuántos asientos aparece, cuánto suma en Debe y en Haber, y el saldo."""
    por_cuenta: dict[str, dict] = {}
    for f in filas:
        r = por_cuenta.setdefault(
            f["codigo_cuenta"],
            {"codigo": f["codigo_cuenta"], "nombre": f["cuenta_nombre"] or f["codigo_cuenta"], "asientos": set(), "debe": 0.0, "haber": 0.0},
        )
        r["asientos"].add(f["nro_asiento"])
        r["debe"] += float(f["debe"] or 0)
        r["haber"] += float(f["haber"] or 0)
    resumen = sorted(por_cuenta.values(), key=lambda r: r["codigo"])
    for r in resumen:
        r["registros"] = len(r.pop("asientos"))
        r["saldo"] = r["debe"] - r["haber"]
    return resumen


def _parse_monto_pegado(texto: str) -> float:
    texto = texto.strip().replace(" ", "")
    if not texto:
        return 0.0
    if "," in texto:
        texto = texto.replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        return 0.0


def _parse_pegado_diario(pegado: str, cuentas_por_codigo: dict, cuentas_por_nombre: dict) -> tuple[list[dict], list[str]]:
    nuevas, advertencias = [], []
    for i, fila in enumerate(pegado.splitlines(), start=1):
        if not fila.strip():
            continue
        partes = fila.split("\t") if "\t" in fila else fila.split(";")
        cuenta_txt = partes[0].strip() if partes else ""
        debe_txt = partes[1].strip() if len(partes) > 1 else ""
        haber_txt = partes[2].strip() if len(partes) > 2 else ""

        codigo = cuenta_txt if cuenta_txt in cuentas_por_codigo else cuentas_por_nombre.get(cuenta_txt.upper())
        if not codigo:
            advertencias.append(f'Fila {i}: no se reconoce la cuenta "{cuenta_txt}".')
            continue

        debe_num = _parse_monto_pegado(debe_txt)
        haber_num = _parse_monto_pegado(haber_txt)
        if debe_num <= 0 and haber_num <= 0:
            advertencias.append(f'Fila {i}: "{cuenta_txt}" no tiene monto en Debe ni en Haber.')
            continue

        if debe_num > 0:
            nuevas.append({"codigo_cuenta": codigo, "lado": "DEBE", "monto": debe_num})
        if haber_num > 0:
            nuevas.append({"codigo_cuenta": codigo, "lado": "HABER", "monto": haber_num})
    return nuevas, advertencias


@router.get("/plan-cuentas", response_class=HTMLResponse)
async def plan_cuentas_page(
    request: Request, session: dict = Depends(require_admin), error: str | None = None, mes: str | None = None
):
    cuentas = await pool().fetch("SELECT codigo, nombre, tipo FROM cuentas_contables ORDER BY codigo")
    return templates.TemplateResponse(
        request,
        "dashboard/contabilidad_plan_cuentas.html",
        {
            "session": session,
            "active": "contabilidad",
            "cuentas": cuentas,
            "tipos": TIPOS_CUENTA,
            "error": error,
            "mes": _mes(mes),
        },
    )


@router.post("/plan-cuentas", response_class=HTMLResponse)
async def crear_cuenta(
    request: Request,
    session: dict = Depends(require_admin),
    codigo: str = Form(""),
    nombre: str = Form(""),
    tipo: str = Form(""),
):
    codigo, nombre, tipo = codigo.strip(), nombre.strip(), tipo.strip().upper()
    if not codigo or not nombre or tipo not in TIPOS_CUENTA:
        cuentas = await pool().fetch("SELECT codigo, nombre, tipo FROM cuentas_contables ORDER BY codigo")
        return templates.TemplateResponse(
            request,
            "dashboard/contabilidad_plan_cuentas.html",
            {
                "session": session,
                "active": "contabilidad",
                "cuentas": cuentas,
                "tipos": TIPOS_CUENTA,
                "error": "Completa código, nombre y tipo válido.",
                "mes": _mes(None),
            },
            status_code=400,
        )

    try:
        await pool().execute(
            "INSERT INTO cuentas_contables (codigo, nombre, tipo) VALUES ($1, $2, $3)", codigo, nombre, tipo
        )
    except Exception:
        cuentas = await pool().fetch("SELECT codigo, nombre, tipo FROM cuentas_contables ORDER BY codigo")
        return templates.TemplateResponse(
            request,
            "dashboard/contabilidad_plan_cuentas.html",
            {
                "session": session,
                "active": "contabilidad",
                "cuentas": cuentas,
                "tipos": TIPOS_CUENTA,
                "error": f"Ya existe una cuenta con código {codigo}.",
                "mes": _mes(None),
            },
            status_code=400,
        )
    await bitacora.registrar(session, "Creó cuenta contable", f"{codigo} — {nombre} ({tipo})")
    return RedirectResponse("/dashboard/contabilidad/plan-cuentas", status_code=303)


async def _diario_context(
    session: dict,
    error: str | None = None,
    lineas: list[dict] | None = None,
    fecha: str | None = None,
    glosa: str = "",
    editando_nro: int | None = None,
    mes: str | None = None,
    dia: str | None = None,
    orden: str | None = None,
    es_apertura: bool = False,
) -> dict:
    mes_ctx = _mes(mes, dia)
    orden = "asc" if orden == "asc" else "desc"
    filas = await _filas_libro_diario(mes_ctx, orden)
    asientos = _agrupar_asientos(filas)
    cuentas = await pool().fetch("SELECT codigo, nombre FROM cuentas_contables ORDER BY nombre")
    lineas = lineas or []
    total_debe = sum(l["monto"] for l in lineas if l["lado"] == "DEBE")
    total_haber = sum(l["monto"] for l in lineas if l["lado"] == "HABER")
    return {
        "session": session,
        "active": "contabilidad",
        "asientos": asientos,
        "cuentas": cuentas,
        "lineas": lineas,
        "total_debe": total_debe,
        "total_haber": total_haber,
        "error": error,
        "hoy": hoy_bolivia().isoformat(),
        "form_fecha": fecha or mes_ctx["dia"] or (hoy_bolivia() if mes_ctx["es_actual"] else mes_ctx["inicio"]).isoformat(),
        "form_glosa": glosa,
        "form_es_apertura": es_apertura,
        "editando_nro": editando_nro,
        "editando_numero_mes": next((a["numero_mes"] for a in asientos if a["nro"] == editando_nro), editando_nro),
        "mes": mes_ctx,
        "filtro_dia": True,
        "orden": orden,
    }


@router.get("/diario", response_class=HTMLResponse)
async def diario_page(
    request: Request,
    session: dict = Depends(require_admin),
    error: str | None = None,
    mes: str | None = None,
    dia: str | None = None,
    orden: str | None = None,
):
    ctx = await _diario_context(session, error=error, mes=mes, dia=dia, orden=orden)
    return templates.TemplateResponse(request, "dashboard/contabilidad_diario.html", ctx)


@router.get("/resumen", response_class=HTMLResponse)
async def resumen_cuentas_page(
    request: Request, session: dict = Depends(require_admin), mes: str | None = None, dia: str | None = None
):
    mes_ctx = _mes(mes, dia)
    filas = await _filas_libro_diario(mes_ctx)
    resumen_cuentas = _resumen_cuentas(filas)
    asientos_totales = len({f["nro_asiento"] for f in filas})
    return templates.TemplateResponse(
        request,
        "dashboard/contabilidad_resumen.html",
        {
            "session": session,
            "active": "contabilidad",
            "resumen_cuentas": resumen_cuentas,
            "asientos_totales": asientos_totales,
            "mes": mes_ctx,
            "filtro_dia": True,
        },
    )


@router.get("/diario/{nro_asiento}/editar", response_class=HTMLResponse)
async def editar_asiento_form(request: Request, nro_asiento: int, session: dict = Depends(require_admin)):
    filas = await pool().fetch(
        """
        SELECT ld.fecha, ld.codigo_cuenta, cc.nombre AS cuenta_nombre, ld.debe, ld.haber, ld.glosa, ld.es_apertura
        FROM libro_diario ld LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
        WHERE ld.nro_asiento = $1
        ORDER BY ld.debe = 0, ld.id
        """,
        nro_asiento,
    )
    if not filas:
        return RedirectResponse("/dashboard/contabilidad/diario", status_code=303)

    lineas = []
    for f in filas:
        if f["debe"] and f["debe"] > 0:
            lineas.append({"codigo_cuenta": f["codigo_cuenta"], "nombre": f["cuenta_nombre"] or f["codigo_cuenta"], "lado": "DEBE", "monto": float(f["debe"])})
        if f["haber"] and f["haber"] > 0:
            lineas.append({"codigo_cuenta": f["codigo_cuenta"], "nombre": f["cuenta_nombre"] or f["codigo_cuenta"], "lado": "HABER", "monto": float(f["haber"])})

    ctx = await _diario_context(
        session,
        lineas=lineas,
        fecha=filas[0]["fecha"].isoformat(),
        glosa=filas[0]["glosa"],
        editando_nro=nro_asiento,
        mes=_mes_de(filas[0]["fecha"]),
        es_apertura=any(f["es_apertura"] for f in filas),
    )
    return templates.TemplateResponse(request, "dashboard/contabilidad_diario.html", ctx)


@router.post("/diario/linea", response_class=HTMLResponse)
async def agregar_linea_asiento(
    request: Request,
    session: dict = Depends(require_admin),
    cuenta: list[str] = Form([]),
    lado: list[str] = Form([]),
    monto: list[str] = Form([]),
    cuenta_selector: str = Form(""),
    lado_selector: str = Form("DEBE"),
    monto_selector: str = Form(""),
):
    lineas = _parse_lineas(cuenta, lado, monto)
    if cuenta_selector and monto_selector:
        try:
            monto_num = float(monto_selector)
        except ValueError:
            monto_num = 0
        if monto_num > 0:
            lineas.append({"codigo_cuenta": cuenta_selector, "lado": lado_selector, "monto": monto_num})

    cuentas_map = {c["codigo"]: c["nombre"] for c in await pool().fetch("SELECT codigo, nombre FROM cuentas_contables")}
    for l in lineas:
        l["nombre"] = cuentas_map.get(l["codigo_cuenta"], l["codigo_cuenta"])
    total_debe = sum(l["monto"] for l in lineas if l["lado"] == "DEBE")
    total_haber = sum(l["monto"] for l in lineas if l["lado"] == "HABER")

    return templates.TemplateResponse(
        request,
        "partials/_lineas_asiento.html",
        {"lineas": lineas, "total_debe": total_debe, "total_haber": total_haber},
    )


@router.post("/diario/linea/quitar", response_class=HTMLResponse)
async def quitar_linea_asiento(
    request: Request,
    session: dict = Depends(require_admin),
    cuenta: list[str] = Form([]),
    lado: list[str] = Form([]),
    monto: list[str] = Form([]),
    quitar_index: str = Form(""),
):
    lineas = _parse_lineas(cuenta, lado, monto)
    try:
        idx = int(quitar_index)
        lineas.pop(idx)
    except (ValueError, IndexError):
        pass

    cuentas_map = {c["codigo"]: c["nombre"] for c in await pool().fetch("SELECT codigo, nombre FROM cuentas_contables")}
    for l in lineas:
        l["nombre"] = cuentas_map.get(l["codigo_cuenta"], l["codigo_cuenta"])
    total_debe = sum(l["monto"] for l in lineas if l["lado"] == "DEBE")
    total_haber = sum(l["monto"] for l in lineas if l["lado"] == "HABER")

    return templates.TemplateResponse(
        request,
        "partials/_lineas_asiento.html",
        {"lineas": lineas, "total_debe": total_debe, "total_haber": total_haber},
    )


@router.post("/diario/pegar", response_class=HTMLResponse)
async def pegar_lineas_asiento(
    request: Request,
    session: dict = Depends(require_admin),
    cuenta: list[str] = Form([]),
    lado: list[str] = Form([]),
    monto: list[str] = Form([]),
    pegado: str = Form(""),
):
    lineas = _parse_lineas(cuenta, lado, monto)
    cuentas_rows = await pool().fetch("SELECT codigo, nombre FROM cuentas_contables")
    cuentas_por_codigo = {c["codigo"]: c["nombre"] for c in cuentas_rows}
    cuentas_por_nombre = {c["nombre"].strip().upper(): c["codigo"] for c in cuentas_rows}

    nuevas, advertencias = _parse_pegado_diario(pegado, cuentas_por_codigo, cuentas_por_nombre)
    lineas.extend(nuevas)

    for l in lineas:
        l["nombre"] = cuentas_por_codigo.get(l["codigo_cuenta"], l["codigo_cuenta"])
    total_debe = sum(l["monto"] for l in lineas if l["lado"] == "DEBE")
    total_haber = sum(l["monto"] for l in lineas if l["lado"] == "HABER")

    return templates.TemplateResponse(
        request,
        "partials/_lineas_asiento.html",
        {"lineas": lineas, "total_debe": total_debe, "total_haber": total_haber, "advertencias": advertencias},
    )


def _fecha_asiento(fecha: str, apertura: bool) -> date:
    """Un asiento de apertura (saldo del mes anterior) siempre va el día 1
    de su mes, así queda primero en el Diario y en el Mayor."""
    fecha_date = date.fromisoformat(fecha)
    return fecha_date.replace(day=1) if apertura else fecha_date


async def _insertar_asiento(conn, fecha: date, nro: int, lineas: list[dict], glosa: str, apertura: bool) -> int:
    """Inserta las líneas del asiento y, si es de apertura, renumera el
    Diario para que quede primero en su mes. Devuelve su número final."""
    primer_id = None
    for l in lineas:
        id_linea = await conn.fetchval(
            """
            INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa, es_apertura)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
            """,
            fecha,
            nro,
            l["codigo_cuenta"],
            l["monto"] if l["lado"] == "DEBE" else 0,
            l["monto"] if l["lado"] == "HABER" else 0,
            glosa,
            apertura,
        )
        primer_id = primer_id or id_linea
    await _ordenar_diario(conn)
    return await conn.fetchval("SELECT nro_asiento FROM libro_diario WHERE id = $1", primer_id)


@router.post("/diario", response_class=HTMLResponse)
async def crear_asiento(
    request: Request,
    session: dict = Depends(require_admin),
    fecha: str = Form(""),
    glosa: str = Form(""),
    cuenta: list[str] = Form([]),
    lado: list[str] = Form([]),
    monto: list[str] = Form([]),
    es_apertura: str = Form(""),
):
    lineas = _parse_lineas(cuenta, lado, monto)
    glosa = glosa.strip()
    apertura = bool(es_apertura)
    total_debe = sum(l["monto"] for l in lineas if l["lado"] == "DEBE")
    total_haber = sum(l["monto"] for l in lineas if l["lado"] == "HABER")

    error = None
    if not fecha:
        error = "Indica la fecha del asiento."
    elif not glosa:
        error = "Indica la glosa (descripción) del asiento."
    elif len(lineas) < 2:
        error = "Un asiento necesita al menos una línea de debe y una de haber."
    elif abs(total_debe - total_haber) > 0.01:
        error = f"El asiento no cuadra: debe {total_debe:.2f} vs haber {total_haber:.2f}."

    if error:
        cuentas_map = {c["codigo"]: c["nombre"] for c in await pool().fetch("SELECT codigo, nombre FROM cuentas_contables")}
        for l in lineas:
            l["nombre"] = cuentas_map.get(l["codigo_cuenta"], l["codigo_cuenta"])
        ctx = await _diario_context(
            session, error=error, lineas=lineas, fecha=fecha, glosa=glosa, mes=fecha[:7], es_apertura=apertura
        )
        return templates.TemplateResponse(request, "dashboard/contabilidad_diario.html", ctx, status_code=400)

    fecha_date = _fecha_asiento(fecha, apertura)

    async with pool().acquire() as conn:
        async with conn.transaction():
            siguiente = await _siguiente_nro_asiento(conn, fecha_date)
            nro = await _insertar_asiento(conn, fecha_date, siguiente, lineas, glosa, apertura)
    await bitacora.registrar(
        session, "Registró asiento contable", f"Asiento #{nro}{' (apertura)' if apertura else ''}: {glosa}"
    )
    return RedirectResponse(f"/dashboard/contabilidad/diario?mes={_mes_de(fecha_date)}", status_code=303)


@router.post("/diario/{nro_asiento}/editar", response_class=HTMLResponse)
async def editar_asiento(
    request: Request,
    nro_asiento: int,
    session: dict = Depends(require_admin),
    fecha: str = Form(""),
    glosa: str = Form(""),
    cuenta: list[str] = Form([]),
    lado: list[str] = Form([]),
    monto: list[str] = Form([]),
    es_apertura: str = Form(""),
):
    lineas = _parse_lineas(cuenta, lado, monto)
    glosa = glosa.strip()
    apertura = bool(es_apertura)
    total_debe = sum(l["monto"] for l in lineas if l["lado"] == "DEBE")
    total_haber = sum(l["monto"] for l in lineas if l["lado"] == "HABER")

    error = None
    if not fecha:
        error = "Indica la fecha del asiento."
    elif not glosa:
        error = "Indica la glosa (descripción) del asiento."
    elif len(lineas) < 2:
        error = "Un asiento necesita al menos una línea de debe y una de haber."
    elif abs(total_debe - total_haber) > 0.01:
        error = f"El asiento no cuadra: debe {total_debe:.2f} vs haber {total_haber:.2f}."

    if error:
        cuentas_map = {c["codigo"]: c["nombre"] for c in await pool().fetch("SELECT codigo, nombre FROM cuentas_contables")}
        for l in lineas:
            l["nombre"] = cuentas_map.get(l["codigo_cuenta"], l["codigo_cuenta"])
        ctx = await _diario_context(
            session, error=error, lineas=lineas, fecha=fecha, glosa=glosa, editando_nro=nro_asiento, mes=fecha[:7],
            es_apertura=apertura,
        )
        return templates.TemplateResponse(request, "dashboard/contabilidad_diario.html", ctx, status_code=400)

    fecha_date = _fecha_asiento(fecha, apertura)

    async with pool().acquire() as conn:
        async with conn.transaction():
            fecha_anterior = await conn.fetchval("SELECT MIN(fecha) FROM libro_diario WHERE nro_asiento = $1", nro_asiento)
            if fecha_anterior is None:
                return RedirectResponse("/dashboard/contabilidad/diario", status_code=303)
            await conn.execute("DELETE FROM libro_diario WHERE nro_asiento = $1", nro_asiento)
            if fecha_anterior == fecha_date:
                # Misma fecha: conserva su número y su lugar dentro del día.
                nuevo_nro = nro_asiento
            else:
                # Cambió la fecha: se reubica al final de los asientos de la
                # fecha nueva (_siguiente_nro_asiento cierra el hueco que
                # dejó en su fecha vieja).
                nuevo_nro = await _siguiente_nro_asiento(conn, fecha_date)
            nuevo_nro = await _insertar_asiento(conn, fecha_date, nuevo_nro, lineas, glosa, apertura)
    detalle_numero = f"Asiento #{nro_asiento}" if nuevo_nro == nro_asiento else f"Asiento #{nro_asiento} (reordenado a #{nuevo_nro})"
    await bitacora.registrar(session, "Editó asiento contable", f"{detalle_numero}: {glosa}")
    return RedirectResponse(f"/dashboard/contabilidad/diario?mes={_mes_de(fecha_date)}", status_code=303)


@router.post("/diario/{nro_asiento}/eliminar")
async def eliminar_asiento(nro_asiento: int, session: dict = Depends(require_admin), mes: str = Form("")):
    fila = await pool().fetchrow("SELECT glosa FROM libro_diario WHERE nro_asiento = $1 LIMIT 1", nro_asiento)
    if fila:
        async with pool().acquire() as conn:
            async with conn.transaction():
                await conn.execute("DELETE FROM libro_diario WHERE nro_asiento = $1", nro_asiento)
                # Cierra el hueco para que los asientos siguientes no queden
                # desordenados respecto de los que se registren después.
                await _ordenar_diario(conn)
        await bitacora.registrar(session, "Eliminó asiento contable", f"Asiento #{nro_asiento}: {fila['glosa']}")
    return RedirectResponse(f"/dashboard/contabilidad/diario?mes={_mes(mes)['valor']}", status_code=303)


async def _cuentas_mayor(cuenta: str | None, mes_ctx: dict):
    """Movimientos del Libro Mayor por cuenta. En cada cuenta va primero el
    asiento de apertura (marcado "Es apertura", saldo del mes anterior), así
    el saldo corrido arranca desde ahí; después el resto por fecha y número."""
    condicion = "WHERE ld.fecha >= $1 AND ld.fecha < $2"
    args = [mes_ctx["desde"], mes_ctx["hasta"]]
    if cuenta:
        condicion += " AND ld.codigo_cuenta = $3"
        args.append(cuenta)
    filas = await pool().fetch(
        f"""
        SELECT ld.id, ld.nro_asiento, nm.numero_mes, ld.codigo_cuenta, cc.nombre AS cuenta_nombre, ld.fecha, ld.glosa, ld.debe, ld.haber
        FROM libro_diario ld
        LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
        {NUMERO_MES_SQL}
        {condicion}
        ORDER BY cc.nombre, ld.codigo_cuenta, ld.fecha,
                 ld.es_apertura DESC, ld.nro_asiento, ld.id
        """,
        *args,
    )

    # Para cada línea, "contrapartida" es el resto de cuentas de ese mismo
    # asiento (puede ser más de una en asientos compuestos, p. ej. ventas
    # facturadas con IT/IVA) — así desde el Mayor se ve el asiento completo
    # sin tener que ir a buscarlo al Libro Diario.
    nros_asiento = {f["nro_asiento"] for f in filas}
    lineas_por_asiento: dict[int, list[dict]] = {}
    if nros_asiento:
        todas_lineas = await pool().fetch(
            """
            SELECT ld.id, ld.nro_asiento, ld.codigo_cuenta, cc.nombre AS cuenta_nombre, ld.debe, ld.haber
            FROM libro_diario ld
            LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
            WHERE ld.nro_asiento = ANY($1::int[])
            """,
            list(nros_asiento),
        )
        for l in todas_lineas:
            lineas_por_asiento.setdefault(l["nro_asiento"], []).append(l)

    def _contrapartida(fila) -> list[dict]:
        return [
            {"codigo": l["codigo_cuenta"], "nombre": l["cuenta_nombre"] or l["codigo_cuenta"]}
            for l in lineas_por_asiento.get(fila["nro_asiento"], [])
            if l["id"] != fila["id"]
        ]

    cuentas_mayor = []
    actual = None
    saldo = 0.0
    for f in filas:
        if actual is None or actual["codigo"] != f["codigo_cuenta"]:
            if actual is not None:
                cuentas_mayor.append(actual)
            actual = {
                "codigo": f["codigo_cuenta"],
                "nombre": f["cuenta_nombre"] or f["codigo_cuenta"],
                "movimientos": [],
                "saldo_final": 0.0,
            }
            saldo = 0.0
        saldo += float(f["debe"]) - float(f["haber"])
        actual["movimientos"].append(
            {
                "nro_asiento": f["nro_asiento"],
                "numero_mes": f["numero_mes"],
                "fecha": f["fecha"],
                "glosa": f["glosa"],
                "contrapartida": _contrapartida(f),
                "debe": f["debe"],
                "haber": f["haber"],
                "saldo": saldo,
            }
        )
        actual["saldo_final"] = saldo
    if actual is not None:
        cuentas_mayor.append(actual)
    return cuentas_mayor


@router.get("/mayor", response_class=HTMLResponse)
async def mayor_page(
    request: Request,
    session: dict = Depends(require_admin),
    cuenta: str | None = None,
    error: str | None = None,
    mes: str | None = None,
    dia: str | None = None,
):
    mes_ctx = _mes(mes, dia)
    cuentas = await pool().fetch("SELECT codigo, nombre FROM cuentas_contables ORDER BY nombre")
    cuentas_mayor = await _cuentas_mayor(cuenta, mes_ctx)

    return templates.TemplateResponse(
        request,
        "dashboard/contabilidad_mayor.html",
        {
            "session": session,
            "active": "contabilidad",
            "cuentas": cuentas,
            "cuenta_filtro": cuenta,
            "cuentas_mayor": cuentas_mayor,
            "error": error,
            "hoy": mes_ctx["dia"] or (hoy_bolivia() if mes_ctx["es_actual"] else mes_ctx["inicio"]).isoformat(),
            "mes": mes_ctx,
            "filtro_dia": True,
        },
    )


@router.post("/mayor/fila", response_class=HTMLResponse)
async def agregar_fila_mayor(
    request: Request,
    session: dict = Depends(require_admin),
    fecha: str = Form(""),
    glosa: str = Form(""),
    cuenta_debe: str = Form(""),
    cuenta_haber: str = Form(""),
    monto: str = Form(""),
    cuenta_filtro: str = Form(""),
    mes: str = Form(""),
):
    glosa = glosa.strip()
    try:
        monto_num = float(monto)
    except ValueError:
        monto_num = 0

    error = None
    if not fecha:
        error = "Indica la fecha."
    elif not glosa:
        error = "Indica la glosa (descripción)."
    elif not cuenta_debe or not cuenta_haber:
        error = "Selecciona la cuenta de debe y la de haber."
    elif cuenta_debe == cuenta_haber:
        error = "La cuenta de debe y la de haber no pueden ser la misma."
    elif monto_num <= 0:
        error = "El monto debe ser mayor a cero."

    if error:
        cuentas = await pool().fetch("SELECT codigo, nombre FROM cuentas_contables ORDER BY nombre")
        mes_ctx = _mes(mes)
        cuentas_mayor = await _cuentas_mayor(cuenta_filtro or None, mes_ctx)
        return templates.TemplateResponse(
            request,
            "dashboard/contabilidad_mayor.html",
            {
                "session": session,
                "active": "contabilidad",
                "cuentas": cuentas,
                "cuenta_filtro": cuenta_filtro or None,
                "cuentas_mayor": cuentas_mayor,
                "error": error,
                "hoy": fecha or hoy_bolivia().isoformat(),
                "mes": mes_ctx,
                "filtro_dia": True,
            },
            status_code=400,
        )

    fecha_date = date.fromisoformat(fecha)
    async with pool().acquire() as conn:
        async with conn.transaction():
            siguiente = await _siguiente_nro_asiento(conn, fecha_date)
            await conn.execute(
                """
                INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa)
                VALUES ($1, $2, $3, $4, 0, $5)
                """,
                fecha_date, siguiente, cuenta_debe, monto_num, glosa,
            )
            await conn.execute(
                """
                INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa)
                VALUES ($1, $2, $3, 0, $4, $5)
                """,
                fecha_date, siguiente, cuenta_haber, monto_num, glosa,
            )

    await bitacora.registrar(session, "Registró asiento desde el Mayor", f"Asiento #{siguiente}: {glosa}")
    destino = f"/dashboard/contabilidad/mayor?mes={_mes_de(fecha_date)}"
    if cuenta_filtro:
        destino += f"&cuenta={cuenta_filtro}"
    return RedirectResponse(destino, status_code=303)


async def _composicion_periodo(fecha_inicio: date, fecha_fin: date) -> dict:
    """Lo que el sistema tiene realmente registrado para un rango de fechas
    (ventas cobradas, egresos de caja y compras de insumos), para comparar
    contra lo que se cargó a mano en el estado de resultados."""
    inicio = datetime.combine(fecha_inicio, time.min, BOLIVIA_TZ)
    fin = datetime.combine(fecha_fin, time.min, BOLIVIA_TZ) + timedelta(days=1)

    ventas_por_tipo = await pool().fetch(
        "SELECT tipo_pago, COALESCE(SUM(total), 0) AS monto, count(*) AS cantidad FROM ordenes "
        "WHERE estado = 'cobrada' AND cobrado_en >= $1 AND cobrado_en < $2 "
        "GROUP BY tipo_pago ORDER BY monto DESC",
        inicio, fin,
    )
    ventas_reales = sum(float(r["monto"]) for r in ventas_por_tipo)

    egresos_por_categoria = await pool().fetch(
        "SELECT COALESCE(categoria, 'Sin categoría') AS categoria, COALESCE(SUM(monto), 0) AS monto FROM movimientos_caja "
        "WHERE tipo = 'egreso' AND creado_en >= $1 AND creado_en < $2 "
        "GROUP BY COALESCE(categoria, 'Sin categoría') ORDER BY monto DESC",
        inicio, fin,
    )
    egresos_reales = sum(float(r["monto"]) for r in egresos_por_categoria)
    compras_reales = float(
        await pool().fetchval(
            "SELECT COALESCE(SUM(total), 0) FROM compras_insumos WHERE fecha >= $1 AND fecha <= $2",
            fecha_inicio, fecha_fin,
        )
    )
    costos_reales = egresos_reales + compras_reales

    return {
        "INGRESOS": {"real": ventas_reales, "detalle": ventas_por_tipo},
        "COSTOS": {
            "real": costos_reales,
            "detalle": egresos_por_categoria,
            "compras_reales": compras_reales,
        },
    }


def _resumen_diferencia(manual: float, real: float) -> dict:
    diferencia = manual - real
    if abs(diferencia) < 1:
        estado = "ok"
    elif diferencia < 0:
        estado = "falta"
    else:
        estado = "de_mas"
    return {"manual": manual, "real": real, "diferencia": diferencia, "estado": estado}


async def _contexto_resultados(mes_ctx: dict, error: str | None = None) -> dict:
    # Períodos que tocan el mes elegido.
    periodos = await pool().fetch(
        "SELECT id, nombre, fecha_inicio, fecha_fin FROM periodos_contables "
        "WHERE fecha_inicio < $2 AND fecha_fin >= $1 ORDER BY fecha_inicio DESC",
        mes_ctx["inicio"], mes_ctx["fin"],
    )
    vistas_periodo = []
    for p in periodos:
        items = await pool().fetch(
            "SELECT seccion, concepto, monto FROM estado_resultados_items WHERE periodo_id = $1 ORDER BY orden",
            p["id"],
        )
        items_por_seccion: dict[str, list] = {}
        totales = {"INGRESOS": 0.0, "COSTOS": 0.0, "IMPUESTOS": 0.0}
        for it in items:
            items_por_seccion.setdefault(it["seccion"], []).append(it)
            totales[it["seccion"]] = totales.get(it["seccion"], 0.0) + float(it["monto"])
        total_final = totales.get("INGRESOS", 0) - totales.get("COSTOS", 0) - totales.get("IMPUESTOS", 0)

        composicion = await _composicion_periodo(p["fecha_inicio"], p["fecha_fin"])
        comparacion = {
            "INGRESOS": _resumen_diferencia(totales.get("INGRESOS", 0), composicion["INGRESOS"]["real"]),
            "COSTOS": _resumen_diferencia(totales.get("COSTOS", 0), composicion["COSTOS"]["real"]),
        }

        vistas_periodo.append({
            "periodo": p,
            "items_por_seccion": items_por_seccion,
            "totales": totales,
            "total_final": total_final,
            "composicion": composicion,
            "comparacion": comparacion,
        })

    return {
        "active": "contabilidad",
        "periodos": periodos,
        "vistas_periodo": vistas_periodo,
        "error": error,
        "mes": mes_ctx,
    }


@router.get("/resultados", response_class=HTMLResponse)
async def resultados_page(request: Request, session: dict = Depends(require_admin), mes: str | None = None):
    contexto = await _contexto_resultados(_mes(mes))
    contexto["session"] = session
    return templates.TemplateResponse(request, "dashboard/contabilidad_resultados.html", contexto)


@router.post("/resultados", response_class=HTMLResponse)
async def crear_periodo_resultados(
    request: Request,
    session: dict = Depends(require_admin),
    nombre: str = Form(""),
    fecha_inicio: str = Form(""),
    fecha_fin: str = Form(""),
    concepto: list[str] = Form([]),
    seccion: list[str] = Form([]),
    monto: list[str] = Form([]),
):
    nombre = nombre.strip()
    items = []
    for c, s, m in zip(concepto, seccion, monto):
        try:
            monto_num = float(m)
        except ValueError:
            continue
        if c.strip() and monto_num != 0:
            items.append((s, c.strip(), monto_num))

    if not nombre or not fecha_inicio or not fecha_fin or not items:
        contexto = await _contexto_resultados(
            _mes(fecha_inicio[:7]), error="Completa nombre, fechas y al menos un concepto con monto."
        )
        contexto["session"] = session
        return templates.TemplateResponse(
            request, "dashboard/contabilidad_resultados.html", contexto, status_code=400
        )

    fecha_inicio_date = date.fromisoformat(fecha_inicio)
    fecha_fin_date = date.fromisoformat(fecha_fin)

    async with pool().acquire() as conn:
        async with conn.transaction():
            periodo_id = await conn.fetchval(
                """
                INSERT INTO periodos_contables (nombre, tipo_periodo, mes, anio, fecha_inicio, fecha_fin, estado)
                VALUES ($1, 'MES', EXTRACT(MONTH FROM $2::date), EXTRACT(YEAR FROM $2::date), $2, $3, 'ABIERTO')
                RETURNING id
                """,
                nombre,
                fecha_inicio_date,
                fecha_fin_date,
            )
            for i, (s, c, m) in enumerate(items):
                await conn.execute(
                    """
                    INSERT INTO estado_resultados_items (periodo_id, seccion, concepto, monto, orden)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    periodo_id,
                    s,
                    c,
                    m,
                    i,
                )
    return RedirectResponse(
        f"/dashboard/contabilidad/resultados?mes={_mes_de(fecha_inicio_date)}#periodo-{periodo_id}", status_code=303
    )


@router.get("/facturas", response_class=HTMLResponse)
async def facturas_page(
    request: Request, session: dict = Depends(require_admin), mes: str | None = None, dia: str | None = None
):
    mes_ctx = _mes(mes, dia)
    hoy = hoy_bolivia()
    inicio_dia = datetime.combine(hoy, time.min, BOLIVIA_TZ)
    fin_dia = inicio_dia + timedelta(days=1)
    # Rango que se muestra: el mes elegido, o solo el día si se filtró por día.
    inicio_mes = datetime.combine(mes_ctx["desde"], time.min, BOLIVIA_TZ)
    fin_mes = datetime.combine(mes_ctx["hasta"], time.min, BOLIVIA_TZ)

    columnas = (
        "id, mesa, total, tipo_pago, responsable, cobrado_en, "
        "factura_nit, factura_celular, factura_nombre, siat_registrado"
    )
    facturas_hoy = [] if not (mes_ctx["desde"] <= hoy < mes_ctx["hasta"]) else await pool().fetch(
        f"""
        SELECT {columnas} FROM ordenes
        WHERE estado = 'cobrada' AND tipo_pago = ANY($1::text[])
          AND cobrado_en >= $2 AND cobrado_en < $3
        ORDER BY cobrado_en
        """,
        list(TIPOS_FACTURADOS), inicio_dia, fin_dia,
    )
    facturas_atrasadas = await pool().fetch(
        f"""
        SELECT {columnas} FROM ordenes
        WHERE estado = 'cobrada' AND tipo_pago = ANY($1::text[])
          AND cobrado_en >= $2 AND cobrado_en < LEAST($3::timestamptz, $4::timestamptz) AND siat_registrado = false
        ORDER BY cobrado_en
        """,
        list(TIPOS_FACTURADOS), inicio_mes, fin_mes, inicio_dia,
    )
    # Pendientes de otros meses: no se listan acá, pero se avisa para que no se olviden.
    pendientes_otros_meses = await pool().fetchval(
        """
        SELECT count(*) FROM ordenes
        WHERE estado = 'cobrada' AND tipo_pago = ANY($1::text[]) AND siat_registrado = false
          AND cobrado_en < $4 AND (cobrado_en < $2 OR cobrado_en >= $3)
        """,
        list(TIPOS_FACTURADOS), inicio_mes, fin_mes, inicio_dia,
    )
    pendientes_hoy = sum(1 for f in facturas_hoy if not f["siat_registrado"])

    return templates.TemplateResponse(
        request,
        "dashboard/contabilidad_facturas.html",
        {
            "session": session,
            "active": "contabilidad",
            "facturas_hoy": facturas_hoy,
            "facturas_atrasadas": facturas_atrasadas,
            "pendientes_hoy": pendientes_hoy,
            "pendientes_atrasadas": len(facturas_atrasadas),
            "pendientes_otros_meses": pendientes_otros_meses,
            "mes": mes_ctx,
            "filtro_dia": True,
        },
    )


@router.post("/facturas/{orden_id}/tickear")
async def tickear_factura(
    orden_id: int,
    session: dict = Depends(require_admin),
    registrado: str = Form("0"),
    mes: str = Form(""),
):
    marcar = registrado == "1"
    orden = await pool().fetchrow("SELECT mesa, tipo_pago FROM ordenes WHERE id = $1", orden_id)
    if orden:
        await pool().execute("UPDATE ordenes SET siat_registrado = $1 WHERE id = $2", marcar, orden_id)
        accion = "Marcó venta como registrada en SIAT" if marcar else "Desmarcó registro SIAT de una venta"
        await bitacora.registrar(session, accion, f"Venta #{orden_id} — {orden['mesa']} ({orden['tipo_pago']})")
    return RedirectResponse(f"/dashboard/contabilidad/facturas?mes={_mes(mes)['valor']}", status_code=303)
