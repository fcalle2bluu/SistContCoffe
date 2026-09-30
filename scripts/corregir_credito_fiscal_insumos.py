"""
Corrige asientos de Insumos Alimenticios que quedaron sin separar el
Credito Fiscal (13% de IVA) del costo neto (87%), segun el criterio del
contador (ver Libro Diario de junio 2026): toda compra de Insumos
Alimenticios CON FACTURA se asienta como Debe Insumos Alimenticios (87%)
+ Debe Credito Fiscal 1130203 (13%) / Haber la cuenta de la que salio la
plata (Caja Chica o Banco).

Este script busca TODOS los asientos que:
  - tienen una linea con la cuenta Insumos Alimenticios (11506), y
  - la glosa menciona "factura" (o sea, no fueron compras con solo recibo), y
  - todavia NO tienen una linea de Credito Fiscal (1130203) en ese mismo
    asiento (para no duplicar si el script ya se corrio antes).

Para cada uno, cambia la linea de Insumos Alimenticios al monto neto (87%)
y agrega una nueva linea de Credito Fiscal (13%), sin tocar el Haber ni el
numero de asiento. Todo dentro de UNA sola transaccion: si algo falla, no
queda nada a medias. Al final verifica que cada asiento tocado siga
cuadrado (Debe == Haber) antes de confirmar.

Uso:
    python scripts/corregir_credito_fiscal_insumos.py            # solo muestra que haria (dry-run)
    python scripts/corregir_credito_fiscal_insumos.py --aplicar   # aplica los cambios de verdad
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app.db import pool, init_pool, close_pool
from app.routers.ventas import CUENTA_INSUMOS_ALIMENTICIOS, CUENTA_CREDITO_FISCAL, TASA_IVA
from app import bitacora


async def _encontrar_asientos_a_corregir(conn):
    """Devuelve las filas de Insumos Alimenticios (una por asiento) que
    tienen factura en la glosa y todavia no separan Credito Fiscal."""
    filas = await conn.fetch(
        """
        SELECT ld.id, ld.nro_asiento, ld.fecha, ld.debe, ld.glosa
        FROM libro_diario ld
        WHERE ld.codigo_cuenta = $1
          AND ld.glosa ILIKE '%factura%'
          AND NOT EXISTS (
              SELECT 1 FROM libro_diario ld2
              WHERE ld2.nro_asiento = ld.nro_asiento AND ld2.codigo_cuenta = $2
          )
        ORDER BY ld.nro_asiento
        """,
        CUENTA_INSUMOS_ALIMENTICIOS, CUENTA_CREDITO_FISCAL,
    )
    return filas


async def main(aplicar: bool) -> None:
    await init_pool()
    try:
        async with pool().acquire() as conn:
            tx = conn.transaction()
            await tx.start()
            try:
                candidatos = await _encontrar_asientos_a_corregir(conn)
                if not candidatos:
                    print("No hay asientos pendientes de corregir. Todo al dia.")
                    return

                print(f"Asientos a corregir: {len(candidatos)}\n")
                resumen = []
                for fila in candidatos:
                    monto = float(fila["debe"])
                    credito_fiscal = round(monto * TASA_IVA, 2)
                    neto = round(monto - credito_fiscal, 2)
                    print(
                        f"  Asiento #{fila['nro_asiento']} ({fila['fecha']}): "
                        f"{monto:.2f} -> Insumos {neto:.2f} + Credito Fiscal {credito_fiscal:.2f}"
                    )
                    print(f"    Glosa: {fila['glosa']}")
                    resumen.append((fila, neto, credito_fiscal))

                    if aplicar:
                        await conn.execute(
                            "UPDATE libro_diario SET debe = $1 WHERE id = $2", neto, fila["id"]
                        )
                        await conn.execute(
                            "INSERT INTO libro_diario (fecha, nro_asiento, codigo_cuenta, debe, haber, glosa) "
                            "VALUES ($1, $2, $3, $4, 0, $5)",
                            fila["fecha"], fila["nro_asiento"], CUENTA_CREDITO_FISCAL, credito_fiscal, fila["glosa"],
                        )

                if not aplicar:
                    print(
                        "\nEsto fue un DRY-RUN: no se escribio nada. "
                        "Corre con --aplicar para aplicar los cambios de verdad."
                    )
                    await tx.rollback()
                    return

                # Verifico que cada asiento tocado siga cuadrado (Debe == Haber).
                for fila, _neto, _cf in resumen:
                    tot = await conn.fetchrow(
                        "SELECT COALESCE(SUM(debe),0) AS d, COALESCE(SUM(haber),0) AS h "
                        "FROM libro_diario WHERE nro_asiento = $1",
                        fila["nro_asiento"],
                    )
                    d, h = float(tot["d"]), float(tot["h"])
                    if abs(d - h) > 0.01:
                        raise AssertionError(
                            f"Asiento #{fila['nro_asiento']} no cuadra tras la correccion: Debe={d} Haber={h}"
                        )

                nros = [fila["nro_asiento"] for fila, _n, _c in resumen]
                await bitacora.registrar(
                    {"nombre": "Corrección automática", "role": "admin"},
                    "Corrigió asientos de Insumos Alimenticios (separó Crédito Fiscal)",
                    f"Asientos {nros}: se separó el 13% de IVA (Crédito Fiscal, {CUENTA_CREDITO_FISCAL}) "
                    f"del 87% neto (Insumos Alimenticios), que habían quedado sin separar antes de "
                    f"aplicar ese criterio. Corrida manualmente con scripts/corregir_credito_fiscal_insumos.py.",
                )

                await tx.commit()
                print(f"\nListo: {len(resumen)} asiento(s) corregido(s) y confirmado(s).")
            except Exception:
                await tx.rollback()
                raise
    finally:
        await close_pool()


if __name__ == "__main__":
    aplicar = "--aplicar" in sys.argv
    asyncio.run(main(aplicar))
