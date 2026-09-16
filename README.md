# Café Yanaloma — ERP & POS

Next.js 16 (App Router, SSR) + Supabase. Reiniciado desde cero el 2026-09-16: se conserva la base de datos (esquema) y el despliegue en Fly.io; el código de la aplicación se reconstruye desde cero con acceso a Supabase server-side en vez de directo desde el cliente.

## Desarrollo

```bash
npm install
npm run dev
```

Variables de entorno requeridas en `.env.local` (no se versiona):

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

## Despliegue

```bash
flyctl deploy --build-arg SUPABASE_URL=... --build-arg SUPABASE_ANON_KEY=...
```

Usuarios de prueba (tabla `usuarios`): `admin` / `admin123` (rol admin), `cajero` / `cajero123` (rol cajero).
