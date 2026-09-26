from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app import bitacora
from app.db import pool
from app.deps import require_admin
from app.routers.ventas import TIPOS_FACTURADOS
from app.templating import templates
from app.tz import BOLIVIA_TZ, hoy_bolivia

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


def _agrupar_asientos(filas) -> list[dict]:
    asientos: dict[int, dict] = {}
    for f in filas:
        a = asientos.setdefault(
            f["nro_asiento"], {"nro": f["nro_asiento"], "fecha": f["fecha"], "glosa": f["glosa"], "lineas": []}
        )
        a["lineas"].append(f)
    for a in asientos.values():
        a["total_debe"] = sum(l["debe"] or 0 for l in a["lineas"])
        a["total_haber"] = sum(l["haber"] or 0 for l in a["lineas"])
    return list(asientos.values())


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
    await bitacora.registrar(session, "Creó cuenta contable", f"{codigo} — {nombre} ({tipo})")
    return RedirectResponse("/dashboard/contabilidad/plan-cuentas", status_code=303)


async def _diario_context(
    session: dict,
    error: str | None = None,
    lineas: list[dict] | None = None,
    fecha: str | None = None,
    glosa: str = "",
    editando_nro: int | None = None,
) -> dict:
    filas = await pool().fetch(
        """
        SELECT ld.fecha, ld.nro_asiento, ld.codigo_cuenta, cc.nombre AS cuenta_nombre,
               ld.debe, ld.haber, ld.glosa
        FROM libro_diario ld
        LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
        ORDER BY ld.fecha DESC, ld.nro_asiento DESC, ld.id
        """
    )
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
        "form_fecha": fecha or hoy_bolivia().isoformat(),
        "form_glosa": glosa,
        "editando_nro": editando_nro,
    }


@router.get("/diario", response_class=HTMLResponse)
async def diario_page(request: Request, session: dict = Depends(require_admin), error: str | None = None):
    ctx = await _diario_context(session, error=error)
    return templates.TemplateResponse(request, "dashboard/contabilidad_diario.html", ctx)


@router.get("/diario/{nro_asiento}/editar", response_class=HTMLResponse)
async def editar_asiento_form(request: Request, nro_asiento: int, session: dict = Depends(require_admin)):
    filas = await pool().fetch(
        """
        SELECT ld.fecha, ld.codigo_cuenta, cc.nombre AS cuenta_nombre, ld.debe, ld.haber, ld.glosa
        FROM libro_diario ld LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
        WHERE ld.nro_asiento = $1
        ORDER BY ld.id
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
        cuentas_map = {c["codigo"]: c["nombre"] for c in await pool().fetch("SELECT codigo, nombre FROM cuentas_contables")}
        for l in lineas:
            l["nombre"] = cuentas_map.get(l["codigo_cuenta"], l["codigo_cuenta"])
        ctx = await _diario_context(session, error=error, lineas=lineas, fecha=fecha, glosa=glosa)
        return templates.TemplateResponse(request, "dashboard/contabilidad_diario.html", ctx, status_code=400)

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
    await bitacora.registrar(session, "Registró asiento contable", f"Asiento #{siguiente}: {glosa}")
    return RedirectResponse("/dashboard/contabilidad/diario", status_code=303)


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
        cuentas_map = {c["codigo"]: c["nombre"] for c in await pool().fetch("SELECT codigo, nombre FROM cuentas_contables")}
        for l in lineas:
            l["nombre"] = cuentas_map.get(l["codigo_cuenta"], l["codigo_cuenta"])
        ctx = await _diario_context(session, error=error, lineas=lineas, fecha=fecha, glosa=glosa, editando_nro=nro_asiento)
        return templates.TemplateResponse(request, "dashboard/contabilidad_diario.html", ctx, status_code=400)

    fecha_date = date.fromisoformat(fecha)

    async with pool().acquire() as conn:
        async with conn.transaction():
            existe = await conn.fetchval("SELECT COUNT(*) FROM libro_diario WHERE nro_asiento = $1", nro_asiento)
            if not existe:
                return RedirectResponse("/dashboard/contabilidad/diario", status_code=303)
            await conn.execute("DELETE FROM libro_diario WHERE nro_asiento = $1", nro_asiento)
            for l in lineas:
                await conn.execute(
                    """
                    INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    fecha_date,
                    nro_asiento,
                    l["codigo_cuenta"],
                    l["monto"] if l["lado"] == "DEBE" else 0,
                    l["monto"] if l["lado"] == "HABER" else 0,
                    glosa,
                )
    await bitacora.registrar(session, "Editó asiento contable", f"Asiento #{nro_asiento}: {glosa}")
    return RedirectResponse("/dashboard/contabilidad/diario", status_code=303)


@router.post("/diario/{nro_asiento}/eliminar")
async def eliminar_asiento(nro_asiento: int, session: dict = Depends(require_admin)):
    fila = await pool().fetchrow("SELECT glosa FROM libro_diario WHERE nro_asiento = $1 LIMIT 1", nro_asiento)
    if fila:
        await pool().execute("DELETE FROM libro_diario WHERE nro_asiento = $1", nro_asiento)
        await bitacora.registrar(session, "Eliminó asiento contable", f"Asiento #{nro_asiento}: {fila['glosa']}")
    return RedirectResponse("/dashboard/contabilidad/diario", status_code=303)


async def _cuentas_mayor(cuenta: str | None):
    condicion = "WHERE ld.codigo_cuenta = $1" if cuenta else ""
    args = [cuenta] if cuenta else []
    filas = await pool().fetch(
        f"""
        SELECT ld.id, ld.nro_asiento, ld.codigo_cuenta, cc.nombre AS cuenta_nombre, ld.fecha, ld.glosa, ld.debe, ld.haber
        FROM libro_diario ld
        LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
        {condicion}
        ORDER BY cc.nombre, ld.fecha, ld.id
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

    def _contrapartida(fila) -> str:
        otras = [
            l["cuenta_nombre"] or l["codigo_cuenta"]
            for l in lineas_por_asiento.get(fila["nro_asiento"], [])
            if l["id"] != fila["id"]
        ]
        return " + ".join(otras) if otras else "—"

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
    request: Request, session: dict = Depends(require_admin), cuenta: str | None = None, error: str | None = None
):
    cuentas = await pool().fetch("SELECT codigo, nombre FROM cuentas_contables ORDER BY nombre")
    cuentas_mayor = await _cuentas_mayor(cuenta)

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
            "hoy": hoy_bolivia().isoformat(),
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
        cuentas_mayor = await _cuentas_mayor(cuenta_filtro or None)
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
                "hoy": hoy_bolivia().isoformat(),
            },
            status_code=400,
        )

    fecha_date = date.fromisoformat(fecha)
    async with pool().acquire() as conn:
        async with conn.transaction():
            siguiente = await conn.fetchval("SELECT COALESCE(MAX(nro_asiento), 0) + 1 FROM libro_diario")
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
    destino = "/dashboard/contabilidad/mayor"
    if cuenta_filtro:
        destino += f"?cuenta={cuenta_filtro}"
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


async def _contexto_resultados(error: str | None = None) -> dict:
    periodos = await pool().fetch(
        "SELECT id, nombre, fecha_inicio, fecha_fin FROM periodos_contables ORDER BY fecha_inicio DESC"
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
    }


@router.get("/resultados", response_class=HTMLResponse)
async def resultados_page(request: Request, session: dict = Depends(require_admin)):
    contexto = await _contexto_resultados()
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
        contexto = await _contexto_resultados(error="Completa nombre, fechas y al menos un concepto con monto.")
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
    return RedirectResponse(f"/dashboard/contabilidad/resultados#periodo-{periodo_id}", status_code=303)


@router.get("/facturas", response_class=HTMLResponse)
async def facturas_page(request: Request, session: dict = Depends(require_admin)):
    hoy = hoy_bolivia()
    inicio_dia = datetime.combine(hoy, time.min, BOLIVIA_TZ)
    fin_dia = inicio_dia + timedelta(days=1)

    columnas = (
        "id, mesa, total, tipo_pago, responsable, cobrado_en, "
        "factura_nit, factura_celular, factura_nombre, siat_registrado"
    )
    facturas_hoy = await pool().fetch(
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
          AND cobrado_en < $2 AND siat_registrado = false
        ORDER BY cobrado_en
        """,
        list(TIPOS_FACTURADOS), inicio_dia,
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
        },
    )


@router.post("/facturas/{orden_id}/tickear")
async def tickear_factura(
    orden_id: int,
    session: dict = Depends(require_admin),
    registrado: str = Form("0"),
):
    marcar = registrado == "1"
    orden = await pool().fetchrow("SELECT mesa, tipo_pago FROM ordenes WHERE id = $1", orden_id)
    if orden:
        await pool().execute("UPDATE ordenes SET siat_registrado = $1 WHERE id = $2", marcar, orden_id)
        accion = "Marcó venta como registrada en SIAT" if marcar else "Desmarcó registro SIAT de una venta"
        await bitacora.registrar(session, accion, f"Venta #{orden_id} — {orden['mesa']} ({orden['tipo_pago']})")
    return RedirectResponse("/dashboard/contabilidad/facturas", status_code=303)
