from datetime import date

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.db import pool
from app.deps import require_admin
from app.templating import templates

router = APIRouter(prefix="/dashboard/contabilidad")

TIPOS_CUENTA = ("ACTIVO", "PASIVO", "PATRIMONIO", "INGRESO", "EGRESO")


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


@router.get("/plan-cuentas", response_class=HTMLResponse)
async def plan_cuentas_page(request: Request, session: dict = Depends(require_admin), error: str | None = None):
    cuentas = await pool().fetch("SELECT codigo, nombre, tipo FROM cuentas_contables ORDER BY codigo")
    return templates.TemplateResponse(
        request,
        "dashboard/contabilidad_plan_cuentas.html",
        {"session": session, "active": "contabilidad", "cuentas": cuentas, "tipos": TIPOS_CUENTA, "error": error},
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
            },
            status_code=400,
        )
    return RedirectResponse("/dashboard/contabilidad/plan-cuentas", status_code=303)


@router.get("/diario", response_class=HTMLResponse)
async def diario_page(request: Request, session: dict = Depends(require_admin), error: str | None = None):
    filas = await pool().fetch(
        """
        SELECT ld.fecha, ld.nro_asiento, ld.codigo_cuenta, cc.nombre AS cuenta_nombre,
               ld.debe, ld.haber, ld.glosa
        FROM libro_diario ld
        LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
        ORDER BY ld.fecha DESC, ld.nro_asiento DESC, ld.id
        """
    )
    asientos: dict[int, dict] = {}
    for f in filas:
        a = asientos.setdefault(
            f["nro_asiento"], {"nro": f["nro_asiento"], "fecha": f["fecha"], "glosa": f["glosa"], "lineas": []}
        )
        a["lineas"].append(f)

    cuentas = await pool().fetch("SELECT codigo, nombre FROM cuentas_contables ORDER BY nombre")
    return templates.TemplateResponse(
        request,
        "dashboard/contabilidad_diario.html",
        {
            "session": session,
            "active": "contabilidad",
            "asientos": list(asientos.values()),
            "cuentas": cuentas,
            "lineas": [],
            "total_debe": 0,
            "total_haber": 0,
            "error": error,
        },
    )


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


@router.post("/diario", response_class=HTMLResponse)
async def crear_asiento(
    request: Request,
    session: dict = Depends(require_admin),
    fecha: str = Form(""),
    glosa: str = Form(""),
    cuenta: list[str] = Form([]),
    lado: list[str] = Form([]),
    monto: list[str] = Form([]),
):
    lineas = _parse_lineas(cuenta, lado, monto)
    glosa = glosa.strip()
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
        filas = await pool().fetch(
            """
            SELECT ld.fecha, ld.nro_asiento, ld.codigo_cuenta, cc.nombre AS cuenta_nombre,
                   ld.debe, ld.haber, ld.glosa
            FROM libro_diario ld LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
            ORDER BY ld.fecha DESC, ld.nro_asiento DESC, ld.id
            """
        )
        asientos: dict[int, dict] = {}
        for f in filas:
            a = asientos.setdefault(
                f["nro_asiento"], {"nro": f["nro_asiento"], "fecha": f["fecha"], "glosa": f["glosa"], "lineas": []}
            )
            a["lineas"].append(f)
        cuentas = await pool().fetch("SELECT codigo, nombre FROM cuentas_contables ORDER BY nombre")
        cuentas_map = {c["codigo"]: c["nombre"] for c in cuentas}
        for l in lineas:
            l["nombre"] = cuentas_map.get(l["codigo_cuenta"], l["codigo_cuenta"])
        return templates.TemplateResponse(
            request,
            "dashboard/contabilidad_diario.html",
            {
                "session": session,
                "active": "contabilidad",
                "asientos": list(asientos.values()),
                "cuentas": cuentas,
                "lineas": lineas,
                "total_debe": total_debe,
                "total_haber": total_haber,
                "error": error,
            },
            status_code=400,
        )

    fecha_date = date.fromisoformat(fecha)

    async with pool().acquire() as conn:
        async with conn.transaction():
            siguiente = await conn.fetchval("SELECT COALESCE(MAX(nro_asiento), 0) + 1 FROM libro_diario")
            for l in lineas:
                await conn.execute(
                    """
                    INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    fecha_date,
                    siguiente,
                    l["codigo_cuenta"],
                    l["monto"] if l["lado"] == "DEBE" else 0,
                    l["monto"] if l["lado"] == "HABER" else 0,
                    glosa,
                )
    return RedirectResponse("/dashboard/contabilidad/diario", status_code=303)


@router.get("/mayor", response_class=HTMLResponse)
async def mayor_page(request: Request, session: dict = Depends(require_admin), cuenta: str | None = None):
    cuentas = await pool().fetch("SELECT codigo, nombre FROM cuentas_contables ORDER BY nombre")

    condicion = "WHERE ld.codigo_cuenta = $1" if cuenta else ""
    args = [cuenta] if cuenta else []
    filas = await pool().fetch(
        f"""
        SELECT ld.codigo_cuenta, cc.nombre AS cuenta_nombre, ld.fecha, ld.glosa, ld.debe, ld.haber
        FROM libro_diario ld
        LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
        {condicion}
        ORDER BY cc.nombre, ld.fecha, ld.id
        """,
        *args,
    )

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
            {"fecha": f["fecha"], "glosa": f["glosa"], "debe": f["debe"], "haber": f["haber"], "saldo": saldo}
        )
        actual["saldo_final"] = saldo
    if actual is not None:
        cuentas_mayor.append(actual)

    return templates.TemplateResponse(
        request,
        "dashboard/contabilidad_mayor.html",
        {
            "session": session,
            "active": "contabilidad",
            "cuentas": cuentas,
            "cuenta_filtro": cuenta,
            "cuentas_mayor": cuentas_mayor,
        },
    )


@router.get("/resultados", response_class=HTMLResponse)
async def resultados_page(request: Request, session: dict = Depends(require_admin), periodo: int | None = None):
    periodos = await pool().fetch(
        "SELECT id, nombre, fecha_inicio, fecha_fin FROM periodos_contables ORDER BY fecha_inicio DESC"
    )
    periodo_actual = None
    items_por_seccion: dict[str, list] = {}
    totales = {"INGRESOS": 0, "COSTOS": 0, "IMPUESTOS": 0}
    if periodos and (periodo or periodos[0]["id"]):
        periodo_id = periodo or periodos[0]["id"]
        periodo_actual = next((p for p in periodos if p["id"] == periodo_id), None)
        items = await pool().fetch(
            "SELECT seccion, concepto, monto FROM estado_resultados_items WHERE periodo_id = $1 ORDER BY orden",
            periodo_id,
        )
        for it in items:
            items_por_seccion.setdefault(it["seccion"], []).append(it)
            totales[it["seccion"]] = totales.get(it["seccion"], 0) + float(it["monto"])

    total_final = totales.get("INGRESOS", 0) - totales.get("COSTOS", 0) - totales.get("IMPUESTOS", 0)

    return templates.TemplateResponse(
        request,
        "dashboard/contabilidad_resultados.html",
        {
            "session": session,
            "active": "contabilidad",
            "periodos": periodos,
            "periodo_actual": periodo_actual,
            "items_por_seccion": items_por_seccion,
            "totales": totales,
            "total_final": total_final,
        },
    )


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
        periodos = await pool().fetch(
            "SELECT id, nombre, fecha_inicio, fecha_fin FROM periodos_contables ORDER BY fecha_inicio DESC"
        )
        return templates.TemplateResponse(
            request,
            "dashboard/contabilidad_resultados.html",
            {
                "session": session,
                "active": "contabilidad",
                "periodos": periodos,
                "periodo_actual": None,
                "items_por_seccion": {},
                "totales": {},
                "total_final": 0,
                "error": "Completa nombre, fechas y al menos un concepto con monto.",
            },
            status_code=400,
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
    return RedirectResponse(f"/dashboard/contabilidad/resultados?periodo={periodo_id}", status_code=303)
