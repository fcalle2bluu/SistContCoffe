# Café Yanaloma — ERP & POS

FastAPI + Jinja2 + htmx, sobre la misma base de datos Postgres (Supabase). Migrado desde Next.js el 2026-09-16: se conserva el esquema y los datos; la aplicación se reescribió en Python.

## Desarrollo

```bash
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # o .venv/bin/pip en Linux/Mac
./.venv/Scripts/python -m uvicorn app.main:app --reload
```

Variables de entorno requeridas en `.env` (no se versiona):

```
DATABASE_URL=postgresql://...   # connection string del pooler de Supabase
SESSION_SECRET=...              # firma la cookie de sesión (HMAC)
```

## Despliegue

```bash
flyctl deploy
flyctl secrets set DATABASE_URL=... SESSION_SECRET=...
```

Usuarios de prueba (tabla `usuarios`): `admin` / `admin123` (rol admin), `cajero` / `cajero123` (rol cajero).
