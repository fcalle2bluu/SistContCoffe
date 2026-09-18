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

## App de escritorio (opcional)

Cada push a `main` compila automáticamente `CafeYanaloma.exe` (GitHub Actions, ver
`.github/workflows/build-desktop.yml`) y lo publica como el último Release del repo.
Es la misma app corriendo en la PC en vez de en el hosting — usa la misma base de datos
Supabase, así que no depende de que el servidor en la nube esté arriba.

- Descargar `CafeYanaloma.exe` desde la pestaña *Releases* del repo y ejecutarlo.
- La primera vez pide completar `DATABASE_URL` y `SESSION_SECRET` en un archivo de
  configuración que abre automáticamente (`%LOCALAPPDATA%\CafeYanaloma\config.env`).
- Al iniciar, abre el navegador en `http://127.0.0.1:8000` (o el siguiente puerto libre).
- En cada arranque revisa si hay una versión más nueva en GitHub y se autoactualiza sola
  antes de abrir el navegador.
- Para compilarlo a mano: `pyinstaller --onefile --name CafeYanaloma --add-data "app/templates;app/templates" --add-data "app/static;app/static" --collect-all uvicorn desktop/launcher.py`.
