from app.db import pool


async def registrar(session: dict, accion: str, detalle: str = "") -> None:
    await pool().execute(
        "INSERT INTO bitacora (usuario, rol, accion, detalle) VALUES ($1, $2, $3, $4)",
        session.get("nombre") or session.get("username") or "?",
        session.get("role"),
        accion,
        detalle,
    )
