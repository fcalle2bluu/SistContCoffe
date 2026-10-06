"""Informe mensual en PDF: gráficos y estadísticas del dashboard más los
libros contables (resumen de cuentas, Libro Diario, Libro Mayor y Estado de
Resultados) de un mes, generado con reportlab (sin dependencias del sistema)."""

import io
from datetime import datetime, time, timedelta
from xml.sax.saxutils import escape

from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    CondPageBreak, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app import bitacora
from app.db import pool
from app.deps import require_admin
from app.routers import contabilidad, dashboard_api
from app.templating import CUENTAS_CAJA, CUENTA_COLORES, formato_bs
from app.tz import BOLIVIA_TZ, ahora_bolivia

ACENTO = colors.HexColor("#b45309")
ACENTO_SUAVE = colors.HexColor("#fef3e2")
TINTA = colors.HexColor("#101828")
GRIS = colors.HexColor("#667085")
BORDE = colors.HexColor("#d0d5dd")
FONDO_CABECERA = colors.HexColor("#f2e6c8")
PALETA = ["#d97706", "#2563eb", "#059669", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#78350f", "#334155"]

# Mismos colores que las cuentas en la pantalla de Contabilidad.
_COLOR_CAJA = {"cta-chica": "#15803d", "cta-mn": "#1d4ed8", "cta-banco": "#7e22ce"}
_COLOR_PALETA = ["#b91c1c", "#c2410c", "#a16207", "#0f766e", "#be185d", "#7c4a1e", "#334155"]


def _color_cuenta(codigo) -> str:
    codigo = str(codigo)
    if codigo in CUENTAS_CAJA:
        return _COLOR_CAJA[CUENTAS_CAJA[codigo]]
    n = int(codigo) if codigo.isdigit() else sum(map(ord, codigo))
    return _COLOR_PALETA[n % CUENTA_COLORES]


_base = getSampleStyleSheet()
EST = {
    "titulo": ParagraphStyle("titulo", parent=_base["Title"], fontSize=26, leading=32, textColor=TINTA, alignment=TA_CENTER),
    "subtitulo": ParagraphStyle("subtitulo", parent=_base["Normal"], fontSize=14, leading=18, textColor=GRIS, alignment=TA_CENTER),
    "h1": ParagraphStyle("h1", parent=_base["Heading1"], fontSize=16, leading=20, textColor=ACENTO, spaceBefore=4, spaceAfter=8),
    "h2": ParagraphStyle("h2", parent=_base["Heading2"], fontSize=12, leading=15, textColor=TINTA, spaceBefore=10, spaceAfter=6),
    "texto": ParagraphStyle("texto", parent=_base["Normal"], fontSize=9, leading=12, textColor=TINTA),
    "nota": ParagraphStyle("nota", parent=_base["Normal"], fontSize=8, leading=10, textColor=GRIS),
    "celda": ParagraphStyle("celda", parent=_base["Normal"], fontSize=8, leading=10, textColor=TINTA),
    "celda_der": ParagraphStyle("celda_der", parent=_base["Normal"], fontSize=8, leading=10, textColor=TINTA, alignment=TA_RIGHT),
    "glosa": ParagraphStyle("glosa", parent=_base["Normal"], fontSize=7.5, leading=9.5, textColor=GRIS, fontName="Helvetica-Oblique"),
}


def _bs(n) -> str:
    return f"Bs {formato_bs(n)}"


def _num(n) -> str:
    n = float(n)
    return formato_bs(n)[:-3] if n == int(n) else formato_bs(n)


def _p(texto, estilo="celda") -> Paragraph:
    return Paragraph(escape(str(texto)), EST[estilo])


def _cuenta(codigo, nombre) -> Paragraph:
    return Paragraph(f'<font color="{_color_cuenta(codigo)}"><b>{escape(str(nombre))}</b></font>', EST["celda"])


def _tabla(filas, anchos, cabecera=1, alinear_derecha=(), estilos_extra=()) -> Table:
    t = Table(filas, colWidths=anchos, repeatRows=cabecera)
    estilo = [
        ("FONTNAME", (0, 0), (-1, cabecera - 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, cabecera - 1), GRIS),
        ("BACKGROUND", (0, 0), (-1, cabecera - 1), FONDO_CABECERA),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDE),
        ("BOX", (0, 0), (-1, -1), 0.8, TINTA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for col in alinear_derecha:
        estilo.append(("ALIGN", (col, 0), (col, -1), "RIGHT"))
    t.setStyle(TableStyle(estilo + list(estilos_extra)))
    return t


# ---------- datos ----------

async def _datos(mes: str) -> dict:
    mes_ctx = contabilidad._mes(mes)
    inicio = datetime.combine(mes_ctx["inicio"], time.min, BOLIVIA_TZ)
    fin = datetime.combine(mes_ctx["fin"], time.min, BOLIVIA_TZ)

    filas_serie, top_productos, categorias, metodos_pago = await dashboard_api._consultas_resumen(
        dashboard_api._bucket_expr("dia"), inicio, fin
    )
    ajustes, por_dia, por_producto = await dashboard_api._estadisticas(inicio, fin)
    estadisticas = dashboard_api._tablas_estadisticas(ajustes, por_dia, por_producto)

    gastos_caja = await pool().fetchval(
        "SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja WHERE tipo = 'egreso' AND creado_en >= $1 AND creado_en < $2",
        inicio, fin,
    )
    compras = await pool().fetchval(
        "SELECT COALESCE(SUM(total), 0) FROM compras_insumos WHERE fecha >= $1 AND fecha < $2",
        mes_ctx["inicio"], mes_ctx["fin"],
    )

    filas_diario = await pool().fetch(
        f"""
        SELECT ld.fecha, ld.nro_asiento, nm.numero_mes, ld.codigo_cuenta, cc.nombre AS cuenta_nombre, ld.debe, ld.haber, ld.glosa
        FROM libro_diario ld LEFT JOIN cuentas_contables cc ON cc.codigo = ld.codigo_cuenta
        {contabilidad.NUMERO_MES_SQL}
        WHERE ld.fecha >= $1 AND ld.fecha < $2
        ORDER BY ld.nro_asiento, COALESCE(ld.orden_linea, 0), ld.debe = 0, ld.id
        """,
        mes_ctx["inicio"], mes_ctx["fin"],
    )
    resultados = await contabilidad._contexto_resultados(mes_ctx)

    return {
        "mes": mes_ctx,
        "serie": {f["bucket"]: float(f["total"]) for f in filas_serie},
        "top_productos": top_productos,
        "categorias": categorias,
        "metodos_pago": metodos_pago,
        "est": estadisticas,
        "gastos": float(gastos_caja) + float(compras),
        "asientos": contabilidad._agrupar_asientos(filas_diario),
        "resumen_cuentas": contabilidad._resumen_cuentas(filas_diario),
        "mayor": await contabilidad._cuentas_mayor(None, mes_ctx),
        "resultados": resultados["vistas_periodo"],
    }


# ---------- gráficos ----------

def _grafico_ventas_dia(d: dict, ancho: float) -> Drawing:
    dias, cursor = [], d["mes"]["inicio"]
    while cursor < d["mes"]["fin"]:
        dias.append(cursor)
        cursor += timedelta(days=1)
    valores = [d["serie"].get(x, 0.0) for x in dias]
    alto = 62 * mm
    dib = Drawing(ancho, alto)
    g = VerticalBarChart()
    g.x, g.y, g.width, g.height = 38, 26, ancho - 50, alto - 36
    g.data = [valores]
    g.categoryAxis.categoryNames = [f"{x.day}" for x in dias]
    g.categoryAxis.labels.fontSize = 6
    g.categoryAxis.labels.fontName = g.valueAxis.labels.fontName = "Helvetica"
    g.valueAxis.labels.fontSize = 7
    g.valueAxis.valueMin = 0
    g.valueAxis.labelTextFormat = lambda v: formato_bs(v)[:-3]
    g.bars[0].fillColor = colors.HexColor(PALETA[0])
    g.bars[0].strokeColor = None
    g.barSpacing = 1
    dib.add(g)
    dib.add(String(ancho / 2, 2, "Día del mes", fontSize=7, fontName="Helvetica", fillColor=GRIS))
    return dib


def _grafico_top(d: dict, ancho: float) -> Drawing:
    filas = list(d["top_productos"])[:10][::-1]
    alto = max(40 * mm, (len(filas) * 7 + 12) * mm / 2.2)
    dib = Drawing(ancho, alto)
    if not filas:
        dib.add(String(10, alto / 2, "Sin ventas de productos este mes.", fontSize=9, fontName="Helvetica", fillColor=GRIS))
        return dib
    g = HorizontalBarChart()
    g.x, g.y, g.width, g.height = 110, 10, ancho - 130, alto - 20
    g.data = [[float(f["cantidad"]) for f in filas]]
    g.categoryAxis.categoryNames = [str(f["nombre"])[:28] for f in filas]
    g.categoryAxis.labels.fontSize = 7
    g.categoryAxis.labels.fontName = g.valueAxis.labels.fontName = g.barLabels.fontName = "Helvetica"
    g.valueAxis.labels.fontSize = 7
    g.valueAxis.valueMin = 0
    g.bars[0].fillColor = colors.HexColor(PALETA[1])
    g.bars[0].strokeColor = None
    g.barLabelFormat = lambda v: _num(v)
    g.barLabels.fontSize = 6.5
    g.barLabels.boxAnchor = "w"
    g.barLabels.dx = 3
    dib.add(g)
    return dib


def _grafico_torta(filas, ancho: float) -> Drawing:
    alto = 58 * mm
    dib = Drawing(ancho, alto)
    filas = [f for f in filas if float(f["monto"]) > 0]
    if not filas:
        dib.add(String(10, alto / 2, "Sin datos este mes.", fontSize=9, fontName="Helvetica", fillColor=GRIS))
        return dib
    total = sum(float(f["monto"]) for f in filas)
    torta = Pie()
    torta.x, torta.y, torta.width, torta.height = 8, 10, alto - 20, alto - 20
    torta.data = [float(f["monto"]) for f in filas]
    torta.labels = None
    torta.slices.strokeColor = colors.white
    torta.slices.strokeWidth = 1
    for i in range(len(filas)):
        torta.slices[i].fillColor = colors.HexColor(PALETA[i % len(PALETA)])
    dib.add(torta)
    ley = Legend()
    ley.x, ley.y = alto + 2, alto - 10
    ley.fontSize = 7
    ley.fontName = "Helvetica"
    ley.boxAnchor = "nw"
    ley.columnMaximum = 10
    ley.dxTextSpace = 4
    ley.alignment = "right"
    ley.colorNamePairs = [
        (colors.HexColor(PALETA[i % len(PALETA)]), f"{float(f['monto']) / total * 100:.0f} %  {str(f['nombre'])[:20]}")
        for i, f in enumerate(filas)
    ]
    dib.add(ley)
    return dib


# ---------- secciones ----------

def _portada(d: dict) -> list:
    est, mes = d["est"], d["mes"]
    total_ventas = sum(x["ventas"] for x in est["por_dia"])
    ticket = est["totales"]["cobrado"] / total_ventas if total_ventas else 0
    kpis = [
        ("Total cobrado", _bs(est["totales"]["cobrado"])),
        ("Ventas de productos", _bs(est["totales"]["productos"])),
        ("Ajustes", _bs(est["totales"]["ajustes"])),
        ("N.º de ventas", _num(total_ventas)),
        ("Ticket promedio", _bs(ticket)),
        ("Días con ventas", _num(len(est["por_dia"]))),
        ("Gastos del mes", _bs(d["gastos"])),
        ("Asientos contables", _num(len(d["asientos"]))),
    ]
    celdas = [
        [Paragraph(f'<font size="7.5" color="#667085">{escape(k.upper())}</font><br/><font size="13"><b>{escape(v)}</b></font>', EST["texto"])
         for k, v in kpis[i:i + 4]]
        for i in range(0, len(kpis), 4)
    ]
    kpi_tabla = Table(celdas, colWidths=[44 * mm] * 4, rowHeights=16 * mm)
    kpi_tabla.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, TINTA), ("INNERGRID", (0, 0), (-1, -1), 0.4, BORDE),
        ("BACKGROUND", (0, 0), (-1, -1), ACENTO_SUAVE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    ahora = ahora_bolivia()
    contenido = [
        Spacer(1, 30 * mm),
        Paragraph("Café Yanaloma", EST["subtitulo"]),
        Spacer(1, 4 * mm),
        Paragraph("Informe mensual", EST["titulo"]),
        Paragraph(escape(mes["nombre"]), ParagraphStyle("mes", parent=EST["titulo"], textColor=ACENTO)),
        Spacer(1, 4 * mm),
        Paragraph(f"Generado el {ahora:%d/%m/%Y a las %H:%M}", EST["subtitulo"]),
        Spacer(1, 16 * mm),
        Paragraph("Resumen del mes", EST["h1"]),
        kpi_tabla,
        Spacer(1, 10 * mm),
        Paragraph("Contenido", EST["h2"]),
    ]
    indice = [
        "1. Gráficos de ventas",
        "2. Ajustes (amortizaciones, extras, tips y descuentos)",
        "3. Estadística por día",
        "4. Estadística por producto",
        "5. Libros contables: resumen de cuentas, Libro Diario, Libro Mayor y Estado de Resultados",
    ]
    contenido += [Paragraph(escape(x), EST["texto"]) for x in indice]
    return contenido + [PageBreak()]


def _seccion_graficos(d: dict, ancho: float) -> list:
    medio = (ancho - 6 * mm) / 2
    tortas = Table(
        [[Paragraph("Ventas por categoría", EST["h2"]), Paragraph("Métodos de pago", EST["h2"])],
         [_grafico_torta(d["categorias"], medio), _grafico_torta(d["metodos_pago"], medio)]],
        colWidths=[medio + 3 * mm, medio + 3 * mm],
    )
    tortas.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return [
        Paragraph("1. Gráficos de ventas", EST["h1"]),
        Paragraph("Ventas por día (total cobrado)", EST["h2"]),
        _grafico_ventas_dia(d, ancho),
        Paragraph("Productos más vendidos (unidades, sin ajustes)", EST["h2"]),
        _grafico_top(d, ancho),
        Spacer(1, 6 * mm),
        tortas,
        Paragraph("Las categorías y los productos no incluyen ajustes (amortizaciones, extras, tips ni descuentos).", EST["nota"]),
        PageBreak(),
    ]


def _seccion_ajustes(d: dict, ancho: float) -> list:
    est = d["est"]
    filas = [["Ajuste", "N.º de ventas", "Monto"]]
    filas += [[_p(a["nombre"]), _num(a["ventas"]), _bs(a["monto"])] for a in est["ajustes"]] or [["Sin ajustes este mes.", "", ""]]
    t = est["totales"]
    cuenta = [
        ["Ventas de productos", _bs(t["productos"])],
        ["+ Ajustes", _bs(t["ajustes"])],
    ]
    if abs(t["diferencia"]) >= 0.01:
        cuenta.append(["+ Otros", _bs(t["diferencia"])])
    cuenta.append(["= Total cobrado", _bs(t["cobrado"])])
    tabla_cuenta = _tabla([["Cuenta del mes", ""]] + cuenta, [ancho * 0.6, ancho * 0.4], alinear_derecha=(1,),
                          estilos_extra=[("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("BACKGROUND", (0, -1), (-1, -1), ACENTO_SUAVE)])
    return [
        Paragraph("2. Ajustes", EST["h1"]),
        Paragraph("Amortizaciones, extras, tips y descuentos: se cobran, pero no son productos vendidos.", EST["texto"]),
        Spacer(1, 3 * mm),
        _tabla(filas, [ancho * 0.6, ancho * 0.2, ancho * 0.2], alinear_derecha=(1, 2)),
        Spacer(1, 5 * mm),
        tabla_cuenta,
    ]


def _seccion_por_dia(d: dict, ancho: float) -> list:
    dias = sorted(d["est"]["por_dia"], key=lambda x: x["fecha"])
    filas = [["Día", "Ventas", "Unidades", "Productos", "Ajustes", "Total cobrado", "Ticket prom."]]
    for x in dias:
        filas.append([x["etiqueta"], _num(x["ventas"]), _num(x["unidades"]), _bs(x["productos"]),
                      _bs(x["ajustes"]) if x["ajustes"] else "—", _bs(x["total"]), _bs(x["ticket"])])
    tot = d["est"]["totales"]
    n = sum(x["ventas"] for x in dias)
    filas.append(["Total", _num(n), _num(sum(x["unidades"] for x in dias)), _bs(tot["productos"]), _bs(tot["ajustes"]),
                  _bs(tot["cobrado"]), _bs(tot["cobrado"] / n if n else 0)])
    anchos = [c * ancho for c in (0.19, 0.09, 0.1, 0.16, 0.14, 0.17, 0.15)]
    return [
        CondPageBreak(60 * mm),
        Paragraph("3. Estadística por día", EST["h1"]),
        _tabla(filas, anchos, alinear_derecha=range(1, 7),
               estilos_extra=[("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("BACKGROUND", (0, -1), (-1, -1), ACENTO_SUAVE)]),
    ]


def _seccion_por_producto(d: dict, ancho: float) -> list:
    filas = [["Producto", "Categoría", "Unidades", "Monto", "% ventas", "Días", "Prom./día"]]
    for p in d["est"]["por_producto"]:
        filas.append([_p(p["nombre"]), _p(p["categoria"]), _num(p["unidades"]), _bs(p["monto"]),
                      f"{p['pct']:.1f} %".replace(".", ","), _num(p["dias"]), _num(round(p["promedio_dia"], 1))])
    if len(filas) == 1:
        filas.append(["Sin ventas de productos este mes.", "", "", "", "", "", ""])
    anchos = [c * ancho for c in (0.3, 0.2, 0.1, 0.14, 0.1, 0.07, 0.09)]
    return [
        CondPageBreak(60 * mm),
        Paragraph("4. Estadística por producto", EST["h1"]),
        _tabla(filas, anchos, alinear_derecha=range(2, 7)),
        PageBreak(),
    ]


def _seccion_contable(d: dict, ancho: float) -> list:
    contenido = [Paragraph("5. Libros contables", EST["h1"])]

    # Resumen de cuentas
    filas = [["Cuenta", "Código", "Registros", "Total Debe", "Total Haber", "Saldo"]]
    for r in d["resumen_cuentas"]:
        filas.append([_cuenta(r["codigo"], r["nombre"]), r["codigo"], _num(r["registros"]),
                      _bs(r["debe"]) if r["debe"] else "", _bs(r["haber"]) if r["haber"] else "", _bs(r["saldo"])])
    total_debe = sum(r["debe"] for r in d["resumen_cuentas"])
    total_haber = sum(r["haber"] for r in d["resumen_cuentas"])
    filas.append(["Total", "", f"{len(d['asientos'])} asientos", _bs(total_debe), _bs(total_haber), ""])
    contenido += [
        Paragraph("Resumen de cuentas del mes", EST["h2"]),
        _tabla(filas, [c * ancho for c in (0.3, 0.12, 0.12, 0.16, 0.16, 0.14)], alinear_derecha=range(2, 6),
               estilos_extra=[("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"), ("BACKGROUND", (0, -1), (-1, -1), ACENTO_SUAVE)]),
        PageBreak(),
    ]

    # Libro Diario
    contenido.append(Paragraph("Libro Diario", EST["h2"]))
    filas = [["N.º", "Fecha", "Cuenta Debe", "Cuenta Haber", "Debe", "Haber"]]
    estilos = []
    for a in d["asientos"]:
        for i, l in enumerate(a["lineas"]):
            debe, haber = float(l["debe"] or 0), float(l["haber"] or 0)
            nombre = l["cuenta_nombre"] or l["codigo_cuenta"]
            filas.append([
                str(a["numero_mes"]) if i == 0 else "",
                f"{a['fecha']:%d/%m/%Y}" if i == 0 else "",
                _cuenta(l["codigo_cuenta"], nombre) if debe > 0 else "",
                _cuenta(l["codigo_cuenta"], nombre) if haber > 0 else "",
                _bs(debe) if debe > 0 else "",
                _bs(haber) if haber > 0 else "",
            ])
        filas.append(["", "", Paragraph(escape(a["glosa"] or ""), EST["glosa"]), "", _bs(a["total_debe"]), _bs(a["total_haber"])])
        fin = len(filas) - 1
        estilos += [
            ("SPAN", (2, fin), (3, fin)),
            ("LINEBELOW", (0, fin), (-1, fin), 0.8, TINTA),
            ("FONTNAME", (4, fin), (5, fin), "Helvetica-Bold"),
            ("BACKGROUND", (0, fin), (-1, fin), colors.HexColor("#fdf8ee")),
        ]
    if len(filas) == 1:
        filas.append(["", "", "Sin asientos este mes.", "", "", ""])
    contenido += [
        _tabla(filas, [c * ancho for c in (0.06, 0.11, 0.28, 0.27, 0.14, 0.14)], alinear_derecha=(4, 5), estilos_extra=estilos),
        PageBreak(),
    ]

    # Libro Mayor
    contenido.append(Paragraph("Libro Mayor", EST["h2"]))
    for cta in d["mayor"]:
        color = colors.HexColor(_color_cuenta(cta["codigo"]))
        filas = [
            [Paragraph(f'<font color="{_color_cuenta(cta["codigo"])}"><b>{escape(cta["nombre"])} ({escape(cta["codigo"])})</b></font>', EST["celda"]),
             "", "", "", "", "", ""],
            ["N.º", "Fecha", "Glosa", "Contrapartida", "Debe", "Haber", "Saldo"],
        ]
        for m in cta["movimientos"]:
            contra = " + ".join(c["nombre"] for c in m["contrapartida"]) or "—"
            filas.append([
                str(m["numero_mes"]), f"{m['fecha']:%d/%m/%Y}", Paragraph(escape(m["glosa"] or ""), EST["glosa"]), _p(contra),
                _bs(m["debe"]) if m["debe"] and m["debe"] > 0 else "",
                _bs(m["haber"]) if m["haber"] and m["haber"] > 0 else "",
                _bs(m["saldo"]),
            ])
        filas.append(["", "", f"Totales y saldo final — {cta['nombre']}", "",
                      _bs(cta["total_debe"]), _bs(cta["total_haber"]), _bs(cta["saldo_final"])])
        t = Table(filas, colWidths=[c * ancho for c in (0.06, 0.1, 0.32, 0.18, 0.11, 0.11, 0.12)], repeatRows=2)
        t.setStyle(TableStyle([
            ("SPAN", (0, 0), (-1, 0)),
            ("BACKGROUND", (0, 0), (-1, 0), colors.Color(color.red, color.green, color.blue, alpha=0.12)),
            ("LINEBEFORE", (0, 0), (0, 0), 3, color),
            ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"), ("TEXTCOLOR", (0, 1), (-1, 1), GRIS),
            ("BACKGROUND", (0, 1), (-1, 1), FONDO_CABECERA),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("SPAN", (2, -1), (3, -1)), ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), ACENTO_SUAVE),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDE), ("BOX", (0, 0), (-1, -1), 0.8, TINTA),
            ("ALIGN", (4, 1), (6, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        contenido += [t, Spacer(1, 5 * mm)]
    if not d["mayor"]:
        contenido.append(Paragraph("Sin movimientos este mes.", EST["texto"]))

    # Estado de Resultados
    if d["resultados"]:
        contenido += [PageBreak(), Paragraph("Estado de Resultados", EST["h2"])]
        for v in d["resultados"]:
            p = v["periodo"]
            filas = [[f"{p['nombre']} ({p['fecha_inicio']:%d/%m/%Y} — {p['fecha_fin']:%d/%m/%Y})", ""]]
            for seccion, etiqueta in (("INGRESOS", "Ingresos"), ("COSTOS", "Costos"), ("IMPUESTOS", "Impuestos")):
                for it in v["items_por_seccion"].get(seccion, []):
                    filas.append([f"   {it['concepto']}", _bs(it["monto"])])
                filas.append([f"Subtotal {etiqueta.lower()}", _bs(v["totales"].get(seccion, 0))])
            filas.append(["Resultado final", _bs(v["total_final"])])
            contenido += [
                KeepTogether(_tabla(filas, [ancho * 0.7, ancho * 0.3], alinear_derecha=(1,),
                                    estilos_extra=[("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                                                   ("BACKGROUND", (0, -1), (-1, -1), ACENTO_SUAVE)])),
                Spacer(1, 5 * mm),
            ]
    return contenido


def _pie_de_pagina(texto_izquierda: str):
    def dibujar(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(GRIS)
        canvas.drawString(15 * mm, 9 * mm, texto_izquierda)
        canvas.drawRightString(A4[0] - 15 * mm, 9 * mm, f"Página {doc.page}")
        canvas.setStrokeColor(BORDE)
        canvas.line(15 * mm, 12 * mm, A4[0] - 15 * mm, 12 * mm)
        canvas.restoreState()
    return dibujar


async def generar_pdf(mes: str | None) -> tuple[bytes, str]:
    """Devuelve el PDF del informe y el mes que se usó ("2026-09")."""
    d = await _datos(mes)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=18 * mm,
        title=f"Informe mensual {d['mes']['nombre']} — Café Yanaloma", author="Café Yanaloma",
    )
    ancho = doc.width
    historia = (
        _portada(d)
        + _seccion_graficos(d, ancho)
        + _seccion_ajustes(d, ancho)
        + _seccion_por_dia(d, ancho)
        + _seccion_por_producto(d, ancho)
        + _seccion_contable(d, ancho)
    )
    pie = _pie_de_pagina(f"Café Yanaloma — Informe mensual {d['mes']['nombre']}")
    doc.build(historia, onFirstPage=pie, onLaterPages=pie)
    return buffer.getvalue(), d["mes"]["valor"]


def _seccion_diario_pdf(asientos: list[dict], ancho: float) -> list:
    filas = [["N.º", "Fecha", "Cuenta Debe", "Cuenta Haber", "Debe", "Haber"]]
    estilos = []
    for a in asientos:
        for i, l in enumerate(a["lineas"]):
            debe, haber = float(l["debe"] or 0), float(l["haber"] or 0)
            nombre = l["cuenta_nombre"] or l["codigo_cuenta"]
            filas.append([
                str(a["numero_mes"]) if i == 0 else "",
                f"{a['fecha']:%d/%m/%Y}" if i == 0 else "",
                _cuenta(l["codigo_cuenta"], nombre) if debe > 0 else "",
                _cuenta(l["codigo_cuenta"], nombre) if haber > 0 else "",
                _bs(debe) if debe > 0 else "",
                _bs(haber) if haber > 0 else "",
            ])
        filas.append(["", "", Paragraph(escape(a["glosa"] or ""), EST["glosa"]), "", _bs(a["total_debe"]), _bs(a["total_haber"])])
        fin = len(filas) - 1
        estilos += [
            ("SPAN", (2, fin), (3, fin)),
            ("LINEBELOW", (0, fin), (-1, fin), 0.8, TINTA),
            ("FONTNAME", (4, fin), (5, fin), "Helvetica-Bold"),
            ("BACKGROUND", (0, fin), (-1, fin), colors.HexColor("#fdf8ee")),
        ]
    if len(filas) == 1:
        filas.append(["", "", "Sin asientos en este período.", "", "", ""])
    return [_tabla(filas, [c * ancho for c in (0.07, 0.11, 0.28, 0.27, 0.135, 0.135)], alinear_derecha=(4, 5), estilos_extra=estilos)]


async def generar_pdf_diario(mes: str | None, dia: str | None) -> tuple[bytes, str, str]:
    """PDF del Libro Diario de un mes (o de un solo día, si se pide). Devuelve
    el PDF, el período usado para el nombre del archivo y su nombre legible."""
    mes_ctx = contabilidad._mes(mes, dia)
    filas = await contabilidad._filas_libro_diario(mes_ctx, "asc")
    asientos = contabilidad._agrupar_asientos(filas)
    total_debe = sum(a["total_debe"] for a in asientos)
    total_haber = sum(a["total_haber"] for a in asientos)
    cuadrado = abs(total_debe - total_haber) < 0.01
    periodo = mes_ctx["dia_nombre"] or mes_ctx["nombre"]

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
        title=f"Libro Diario {periodo} — Café Yanaloma", author="Café Yanaloma",
    )
    ancho = doc.width

    encabezado = [
        Paragraph("Café Yanaloma", EST["subtitulo"]),
        Spacer(1, 2 * mm),
        Paragraph("Libro Diario", EST["titulo"]),
        Paragraph(escape(periodo), ParagraphStyle("periodo_diario", parent=EST["titulo"], fontSize=18, leading=22, textColor=ACENTO)),
        Spacer(1, 2 * mm),
        Paragraph(f"Generado el {ahora_bolivia():%d/%m/%Y a las %H:%M} — {len(asientos)} asientos", EST["subtitulo"]),
        Spacer(1, 8 * mm),
    ]

    resumen = _tabla(
        [
            ["Totales del período", ""],
            ["N.º de asientos", _num(len(asientos))],
            ["Total Debe", _bs(total_debe)],
            ["Total Haber", _bs(total_haber)],
            ["Cuadre", "Sí" if cuadrado else "No cuadra"],
        ],
        [ancho * 0.6, ancho * 0.4], alinear_derecha=(1,),
        estilos_extra=[
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), ACENTO_SUAVE if cuadrado else colors.HexColor("#fde2e1")),
        ],
    )

    historia = encabezado + _seccion_diario_pdf(asientos, ancho) + [Spacer(1, 6 * mm), resumen]
    pie = _pie_de_pagina(f"Café Yanaloma — Libro Diario {periodo}")
    doc.build(historia, onFirstPage=pie, onLaterPages=pie)
    return buffer.getvalue(), (mes_ctx["dia"] or mes_ctx["valor"]), periodo


router = APIRouter()


@router.get("/dashboard/informe.pdf")
async def descargar_informe(mes: str | None = None, session: dict = Depends(require_admin)):
    pdf, mes_usado = await generar_pdf(mes)
    await bitacora.registrar(session, "Descargó informe mensual PDF", mes_usado)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Informe-Yanaloma-{mes_usado}.pdf"'},
    )


@router.get("/dashboard/contabilidad/diario.pdf")
async def descargar_diario_pdf(mes: str | None = None, dia: str | None = None, session: dict = Depends(require_admin)):
    pdf, periodo_valor, periodo_nombre = await generar_pdf_diario(mes, dia)
    await bitacora.registrar(session, "Descargó Libro Diario en PDF", periodo_nombre)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Libro-Diario-Yanaloma-{periodo_valor}.pdf"'},
    )
