import os
import ssl

import asyncpg

_pool: asyncpg.Pool | None = None


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        os.environ["DATABASE_URL"], min_size=1, max_size=10, ssl=_ssl_context()
    )
    await _asegurar_columnas()


async def _asegurar_columnas() -> None:
    """Columnas agregadas después de crear las tablas (idempotente; mismo SQL
    que en scripts/). Así un despliegue nuevo no falla si todavía no se corrió."""
    assert _pool is not None
    await _pool.execute(
        "ALTER TABLE compras_insumos ADD COLUMN IF NOT EXISTS cantidad_final numeric(12,3)"
    )


async def close_pool() -> None:
    if _pool is not None:
        await _pool.close()


def pool() -> asyncpg.Pool:
    assert _pool is not None, "Pool de base de datos no inicializado."
    return _pool
