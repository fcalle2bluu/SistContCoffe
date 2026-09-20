"""Importación única: reemplaza los datos transaccionales de producción por lo
reconstruido desde el cuaderno manual `SISTEMA 2026 - SEPTIEMBRE 2026.csv`.

Ver el plan en C:\\Users\\Asus\\.claude\\plans\\cryptic-frolicking-beacon.md para el
detalle de las reglas de reconstrucción. Este script:

  1. Vuelca a JSON (backup) las tablas que va a vaciar.
  2. Vacía orden_items, ordenes, movimientos_caja, libro_diario, compras_insumos,
     turnos (en ese orden, respetando FKs). No toca usuarios, cuentas_contables,
     productos, clientes, bitacora ni las tablas de referencia.
  3. Parsea el CSV con una máquina de estados (turno abierto/cerrado) y reconstruye
     turnos, ordenes+items y movimientos_caja.
  4. Genera asientos de Libro Diario por cada cierre de turno (mismo criterio que
     `_registrar_ventas_efectivo_en_diario` en app/routers/ventas.py).
  5. Imprime un reporte con cada corrección/decisión aplicada.

Uso:
    python scripts/importar_septiembre_2026.py            # dry-run: solo reporta
    python scripts/importar_septiembre_2026.py --commit    # ejecuta de verdad
"""

import asyncio
import csv
import json
import os
import ssl
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env")

sys.path.insert(0, str(REPO_ROOT))
from app.tz import BOLIVIA_TZ  # noqa: E402

CSV_PATH = REPO_ROOT / "SISTEMA 2026 - SEPTIEMBRE 2026.csv"
BACKUP_DIR = Path(os.environ.get("TEMP", "/tmp")) / "cafeyanaloma_backup_pre_import"

TIPOS_PAGO_VALIDOS = ("EFECTIVO", "QR", "POS", "EFEC/FAC", "QR/FAC")
PAGOS_EFECTIVO = ("EFECTIVO", "EFEC/FAC")
CUENTA_CAJA_EFECTIVO = "1110101"
CUENTA_VENTAS = "5010101"

TIPOS_VENTA = ("VENTA", "VENT/FAC")
TIPOS_EGRESO = ("COMPRA", "COMP/FAC")
TIPOS_INGRESO = ("INGRESO A CAJA",)
TIPOS_OMITIDOS = ("TUESTE", "NOVEDAD")
TIPOS_RECONOCIDOS = TIPOS_VENTA + TIPOS_EGRESO + TIPOS_INGRESO + TIPOS_OMITIDOS + ("APERTURA", "CIERRE")

TABLAS_A_BORRAR = [
    "orden_items", "ordenes", "movimientos_caja", "libro_diario", "compras_insumos", "turnos",
]


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


# ---------------------------------------------------------------------------
# Parsing de valores del CSV
# ---------------------------------------------------------------------------

def parse_monto(s: str) -> float:
    s = (s or "").strip()
    if not s:
        return 0.0
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_fecha(s: str) -> date | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        d, m, y = s.split("/")
        return date(2000 + int(y), int(m), int(d))
    except (ValueError, IndexError):
        return None


def parse_hra(s: str) -> time | None:
    s = (s or "").strip()
    if not s or s == "0":
        return None
    s = s.replace(".", ":")
    try:
        partes = s.split(":")
        h = int(partes[0])
        m = int(partes[1]) if len(partes) > 1 else 0
        if 0 <= h < 24 and 0 <= m < 60:
            return time(h, m)
    except (ValueError, IndexError):
        pass
    return None


def normalizar(s: str) -> str:
    return " ".join((s or "").strip().casefold().split())


# ---------------------------------------------------------------------------
# Lectura del CSV
# ---------------------------------------------------------------------------

def col(row: list, i: int) -> str:
    return row[i] if i < len(row) else ""


def leer_filas_reales(csv_path: Path) -> list[dict]:
    with open(csv_path, encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))

    filas = []
    for num_fila, r in enumerate(rows[5:], start=6):
        tipo = col(r, 27).strip()
        if tipo not in TIPOS_RECONOCIDOS:
            continue
        items = []
        for base in (3, 7, 11, 15, 19, 23):
            nombre = col(r, base).strip()
            cantidad = parse_monto(col(r, base + 1))
            if nombre in ("", "-") or cantidad == 0:
                continue
            precio = parse_monto(col(r, base + 2))
            items.append({"nombre": nombre, "cantidad": cantidad, "precio_unitario": precio})

        filas.append({
            "num_fila": num_fila,
            "total_bs": parse_monto(col(r, 0)),
            "mesa": col(r, 1).strip() or "-",
            "hra_raw": col(r, 2).strip(),
            "items": items,
            "tipo_transaccion": tipo,
            "tipo_pago": col(r, 29).strip(),
            "pago_entregado": parse_monto(col(r, 30)),
            "parcial": col(r, 31).strip(),
            "observacion": col(r, 32).strip(),
            "ingreso": parse_monto(col(r, 33)),
            "egreso": parse_monto(col(r, 34)),
            "responsable": col(r, 35).strip() or "Sin nombre",
            "fecha_raw": col(r, 36).strip(),
        })
    return filas


def corregir_fechas(filas: list[dict]) -> list[dict]:
    """Las filas están en orden cronológico estricto. Si una fecha retrocede
    respecto de la anterior, es un error de tipeo (ej. 07/08 en vez de 07/09):
    se corrige al mes/día de la fila anterior cuando eso restaura el orden."""
    correcciones = []
    ultima = None
    for f in filas:
        original = parse_fecha(f["fecha_raw"])
        fecha = original
        if fecha is None and ultima is not None:
            fecha = ultima
        elif fecha is not None and ultima is not None and fecha < ultima:
            candidata = fecha.replace(month=ultima.month, year=ultima.year)
            if candidata >= ultima:
                correcciones.append((f["num_fila"], f["fecha_raw"], candidata.isoformat()))
                fecha = candidata
            else:
                fecha = ultima
        f["fecha"] = fecha
        ultima = fecha
    f_globales["correcciones_fecha"] = correcciones
    return filas


# ---------------------------------------------------------------------------
# Máquina de estados: turnos, ordenes, movimientos
# ---------------------------------------------------------------------------

f_globales: dict = {}


def construir_datos(filas: list[dict]) -> dict:
    turnos: list[dict] = []
    ordenes: list[dict] = []
    movimientos: list[dict] = []
    omitidas: list[dict] = []
    anomalias: list[str] = []

    turno_actual: int | None = None
    ultima_hora_por_fecha: dict[date, time] = {}

    def hora_para(fila: dict) -> time:
        h = parse_hra(fila["hra_raw"])
        if h is not None:
            ultima_hora_por_fecha[fila["fecha"]] = h
            return h
        anterior = ultima_hora_por_fecha.get(fila["fecha"], time(6, 0))
        nueva = (datetime.combine(date.today(), anterior) + timedelta(minutes=1)).time()
        ultima_hora_por_fecha[fila["fecha"]] = nueva
        return nueva

    def dt_fila(fila: dict) -> datetime:
        return datetime.combine(fila["fecha"], hora_para(fila), tzinfo=BOLIVIA_TZ)

    for fila in filas:
        tipo = fila["tipo_transaccion"]
        momento = dt_fila(fila)
        monto_turno = fila["pago_entregado"] or parse_monto(fila["parcial"])

        if tipo == "APERTURA":
            if turno_actual is not None:
                turnos[turno_actual]["monto_final_declarado"] = monto_turno
                turnos[turno_actual]["cerrado_en"] = momento
                turnos[turno_actual]["estado"] = "cerrado"
                anomalias.append(
                    f"Fila {fila['num_fila']}: APERTURA con un turno ya abierto (turno #{turno_actual}, "
                    f"sin CIERRE registrado en el cuaderno para ese turno); se infiere su cierre con el "
                    f"monto de esta apertura (Bs {monto_turno:.2f}) y se abre el turno nuevo normalmente."
                )
                turno_actual = None
            if monto_turno == 0 and turnos and (turnos[-1]["monto_final_declarado"] or 0) > 0:
                heredado = turnos[-1]["monto_final_declarado"]
                anomalias.append(
                    f"Fila {fila['num_fila']}: APERTURA con monto en blanco/0 en el cuaderno; se usa el "
                    f"monto del cierre anterior (Bs {heredado:.2f}) en vez de 0."
                )
                monto_turno = heredado
            turnos.append({
                "responsable": fila["responsable"],
                "monto_inicial": monto_turno,
                "monto_final_declarado": None,
                "abierto_en": momento,
                "cerrado_en": None,
                "estado": "abierto",
            })
            turno_actual = len(turnos) - 1

        elif tipo == "CIERRE":
            if turno_actual is None:
                if turnos:
                    turnos[-1]["monto_final_declarado"] = monto_turno
                    anomalias.append(
                        f"Fila {fila['num_fila']}: CIERRE sin turno abierto; se aplicó como corrección "
                        f"del monto final del turno anterior (#{len(turnos) - 1})."
                    )
                else:
                    anomalias.append(f"Fila {fila['num_fila']}: CIERRE sin ningún turno previo; se ignora.")
                continue
            turnos[turno_actual]["monto_final_declarado"] = monto_turno
            turnos[turno_actual]["cerrado_en"] = momento
            turnos[turno_actual]["estado"] = "cerrado"
            turno_actual = None

        elif tipo in TIPOS_VENTA:
            if turno_actual is None:
                monto_inicial = turnos[-1]["monto_final_declarado"] if turnos and turnos[-1]["monto_final_declarado"] is not None else 0.0
                turnos.append({
                    "responsable": fila["responsable"],
                    "monto_inicial": monto_inicial,
                    "monto_final_declarado": None,
                    "abierto_en": momento,
                    "cerrado_en": None,
                    "estado": "abierto",
                })
                turno_actual = len(turnos) - 1
                anomalias.append(
                    f"Fila {fila['num_fila']}: venta sin apertura previa; se abrió un turno implícito "
                    f"(#{turno_actual}) heredando Bs {monto_inicial:.2f} del cierre anterior."
                )

            es_pendiente = fila["tipo_pago"] == "PENDIENTE"
            tipo_pago = None if es_pendiente else (fila["tipo_pago"] if fila["tipo_pago"] in TIPOS_PAGO_VALIDOS else None)
            ordenes.append({
                "turno_idx": turno_actual,
                "mesa": fila["mesa"],
                "estado": "abierta" if es_pendiente else "cobrada",
                "tipo_pago": tipo_pago,
                "monto_pagado": None if es_pendiente else (fila["pago_entregado"] or fila["total_bs"]),
                "responsable": fila["responsable"],
                "observacion": fila["observacion"] or None,
                "total": fila["total_bs"],
                "creado_en": momento,
                "cobrado_en": None if es_pendiente else momento,
                "items": fila["items"],
            })

        elif tipo in TIPOS_EGRESO or tipo in TIPOS_INGRESO:
            if turno_actual is None:
                monto_inicial = turnos[-1]["monto_final_declarado"] if turnos and turnos[-1]["monto_final_declarado"] is not None else 0.0
                turnos.append({
                    "responsable": fila["responsable"],
                    "monto_inicial": monto_inicial,
                    "monto_final_declarado": None,
                    "abierto_en": momento,
                    "cerrado_en": None,
                    "estado": "abierto",
                })
                turno_actual = len(turnos) - 1
                anomalias.append(
                    f"Fila {fila['num_fila']}: movimiento de caja sin apertura previa; se abrió un turno "
                    f"implícito (#{turno_actual})."
                )
            monto = max(abs(fila["ingreso"]), abs(fila["egreso"]))
            tp = fila["tipo_pago"] if fila["tipo_pago"] in TIPOS_PAGO_VALIDOS else "EFECTIVO"
            motivo = fila["items"][0]["nombre"] if fila["items"] else (fila["mesa"] if fila["mesa"] not in ("-",) else "Movimiento de caja")
            # el texto libre de estas filas vive en la columna del primer item (nombre), no en items[]
            movimientos.append({
                "turno_idx": turno_actual,
                "tipo": "ingreso" if tipo in TIPOS_INGRESO else "egreso",
                "monto": monto,
                "motivo": motivo,
                "responsable": fila["responsable"],
                "tipo_pago": tp,
                "creado_en": momento,
            })

        elif tipo in TIPOS_OMITIDOS:
            omitidas.append({"fila": fila["num_fila"], "tipo": tipo, "detalle": fila["mesa"]})

    if turno_actual is not None:
        turnos[turno_actual]["estado"] = "abierto"

    return {
        "turnos": turnos, "ordenes": ordenes, "movimientos": movimientos,
        "omitidas": omitidas, "anomalias": anomalias,
    }


# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

async def hacer_backup(conn: asyncpg.Connection) -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    for tabla in TABLAS_A_BORRAR:
        filas = await conn.fetch(f'SELECT * FROM public."{tabla}"')
        datos = [dict(r) for r in filas]
        destino = BACKUP_DIR / f"{tabla}_{ts}.json"
        destino.write_text(json.dumps(datos, default=str, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  backup {tabla}: {len(datos)} filas -> {destino}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    commit = "--commit" in sys.argv

    filas = leer_filas_reales(CSV_PATH)
    filas = corregir_fechas(filas)
    datos = construir_datos(filas)

    print("=" * 70)
    print("REPORTE DE IMPORTACIÓN (dry-run)" if not commit else "REPORTE DE IMPORTACIÓN (COMMIT)")
    print("=" * 70)
    print(f"Filas reales leídas del CSV: {len(filas)}")
    print(f"Turnos reconstruidos: {len(datos['turnos'])}")
    print(f"Ventas (ordenes): {len(datos['ordenes'])}")
    print(f"Movimientos de caja: {len(datos['movimientos'])}")
    print(f"Filas omitidas (TUESTE/NOVEDAD): {len(datos['omitidas'])}")

    print(f"\nCorrecciones de fecha aplicadas: {len(f_globales.get('correcciones_fecha', []))}")
    for num, orig, corr in f_globales.get("correcciones_fecha", []):
        print(f"  fila {num}: '{orig}' -> {corr}")

    print(f"\nAnomalías / decisiones de criterio: {len(datos['anomalias'])}")
    for a in datos["anomalias"]:
        print(f"  - {a}")

    print(f"\nFilas omitidas:")
    for o in datos["omitidas"]:
        print(f"  fila {o['fila']} ({o['tipo']}): {o['detalle']}")

    conn = await asyncpg.connect(os.environ["DATABASE_URL"], ssl=_ssl_context())
    try:
        productos_rows = await conn.fetch("SELECT id, nombre FROM productos")
        productos_por_nombre = {normalizar(r["nombre"]): r["id"] for r in productos_rows}

        nombres_sin_match = set()
        for o in datos["ordenes"]:
            for it in o["items"]:
                if normalizar(it["nombre"]) not in productos_por_nombre:
                    nombres_sin_match.add(it["nombre"])
        print(f"\nÍtems sin producto existente que coincida ({len(nombres_sin_match)} nombres distintos):")
        for n in sorted(nombres_sin_match):
            print(f"  - {n!r}")

        if not commit:
            print("\n(dry-run: no se modificó nada. Ejecutar con --commit para aplicar.)")
            return

        print("\n--- Iniciando backup ---")
        await hacer_backup(conn)

        async with conn.transaction():
            print("\n--- Borrando tablas ---")
            for tabla in TABLAS_A_BORRAR:
                r = await conn.execute(f'DELETE FROM public."{tabla}"')
                print(f"  {tabla}: {r}")

            print("\n--- Insertando turnos ---")
            turno_ids = []
            for t in datos["turnos"]:
                tid = await conn.fetchval(
                    "INSERT INTO turnos (responsable, monto_inicial, monto_final_declarado, estado, abierto_en, cerrado_en) "
                    "VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
                    t["responsable"], t["monto_inicial"], t["monto_final_declarado"], t["estado"],
                    t["abierto_en"], t["cerrado_en"],
                )
                turno_ids.append(tid)
            print(f"  {len(turno_ids)} turnos insertados")

            print("\n--- Insertando ordenes + items ---")
            for o in datos["ordenes"]:
                oid = await conn.fetchval(
                    "INSERT INTO ordenes (turno_id, mesa, estado, tipo_pago, monto_pagado, responsable, "
                    "observacion, total, creado_en, cobrado_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
                    turno_ids[o["turno_idx"]], o["mesa"], o["estado"], o["tipo_pago"], o["monto_pagado"],
                    o["responsable"], o["observacion"], o["total"], o["creado_en"], o["cobrado_en"],
                )
                for it in o["items"]:
                    pid = productos_por_nombre.get(normalizar(it["nombre"]))
                    await conn.execute(
                        "INSERT INTO orden_items (orden_id, producto_id, producto_nombre, cantidad, precio_unitario) "
                        "VALUES ($1,$2,$3,$4,$5)",
                        oid, pid, it["nombre"], it["cantidad"], it["precio_unitario"],
                    )
            print(f"  {len(datos['ordenes'])} ordenes insertadas")

            print("\n--- Insertando movimientos de caja ---")
            for m in datos["movimientos"]:
                await conn.execute(
                    "INSERT INTO movimientos_caja (turno_id, tipo, monto, motivo, responsable, tipo_pago, creado_en) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7)",
                    turno_ids[m["turno_idx"]], m["tipo"], m["monto"], m["motivo"], m["responsable"],
                    m["tipo_pago"], m["creado_en"],
                )
            print(f"  {len(datos['movimientos'])} movimientos insertados")

            print("\n--- Generando asientos de Libro Diario (por turno cerrado) ---")
            nro_asiento = 0
            asientos = 0
            for idx, t in enumerate(datos["turnos"]):
                if t["estado"] != "cerrado":
                    continue
                tid = turno_ids[idx]
                total = await conn.fetchval(
                    "SELECT COALESCE(SUM(total), 0) FROM ordenes WHERE turno_id = $1 AND estado = 'cobrada' "
                    "AND tipo_pago = ANY($2::text[])",
                    tid, list(PAGOS_EFECTIVO),
                )
                if not total or total <= 0:
                    continue
                nro_asiento += 1
                glosa = f"Ventas en efectivo del turno de {t['responsable']} (cierre de caja, turno #{tid})."
                fecha_asiento = t["cerrado_en"].date()
                await conn.execute(
                    "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                    "VALUES ($1,$2,$3,$4,0,$5)",
                    fecha_asiento, nro_asiento, CUENTA_CAJA_EFECTIVO, float(total), glosa,
                )
                await conn.execute(
                    "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                    "VALUES ($1,$2,$3,0,$4,$5)",
                    fecha_asiento, nro_asiento, CUENTA_VENTAS, float(total), glosa,
                )
                asientos += 1
            print(f"  {asientos} asientos generados")

            await conn.execute(
                "INSERT INTO bitacora (usuario, rol, accion, detalle) VALUES ($1,$2,$3,$4)",
                "Freddy (importación vía Claude)", "admin", "Importó datos desde CSV",
                f"Reemplazo total de datos de producción por el cuaderno de septiembre 2026: "
                f"{len(turno_ids)} turnos, {len(datos['ordenes'])} ventas, {len(datos['movimientos'])} "
                f"movimientos de caja, {asientos} asientos contables.",
            )

        print("\n--- COMMIT completo ---")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
