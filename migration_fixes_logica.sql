-- ================================================================
-- Migración: corrección de errores lógicos detectados en revisión de código
-- Ejecutar en el SQL Editor de Supabase o vía conexión directa a Postgres.
-- ================================================================

-- 1. NUMERACIÓN ATÓMICA DE ASIENTOS CONTABLES --------------------------------
-- Antes: el próximo nro_asiento se calculaba con SELECT MAX()+1 sin bloqueo,
-- por lo que dos cajeros cobrando casi al mismo tiempo podían generar el mismo
-- número de asiento y mezclar dos ventas distintas en un solo asiento.
-- Una secuencia de Postgres asigna el siguiente valor de forma atómica.
CREATE SEQUENCE IF NOT EXISTS nro_asiento_seq;

SELECT setval('nro_asiento_seq', (SELECT COALESCE(MAX(nro_asiento), 0) FROM libro_diario), true);

CREATE OR REPLACE FUNCTION siguiente_nro_asiento()
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT nextval('nro_asiento_seq');
$$;

GRANT EXECUTE ON FUNCTION siguiente_nro_asiento() TO anon, authenticated;

-- 2. NUEVAS CUENTAS CONTABLES -------------------------------------------------
-- 'Descuentos sobre Ventas': antes los descuentos de venta solo se restaban
-- del monto asentado en Ventas, sin dejar rastro contable de cuánto se
-- descontó. Ahora Ventas se asienta a precio de lista y el descuento se
-- debita aquí por separado.
INSERT INTO cuentas_contables (codigo, nombre, tipo)
SELECT '5010103', 'Descuentos sobre Ventas', 'EGRESO'
WHERE NOT EXISTS (SELECT 1 FROM cuentas_contables WHERE codigo = '5010103');

-- 'POS / Tarjeta (por cobrar)': antes los pagos con POS se asentaban en la
-- misma cuenta que los pagos QR (Banco Bisa), aunque la app ya los distingue
-- en otros reportes. POS liquida con demora (T+1/T+2), así que se trata como
-- una cuenta por cobrar independiente en vez de mezclarla con el banco.
INSERT INTO cuentas_contables (codigo, nombre, tipo)
SELECT '1110105', 'POS / Tarjeta (por cobrar)', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM cuentas_contables WHERE codigo = '1110105');

-- 3. Recargar el caché de esquemas de PostgREST -----------------------------
NOTIFY pgrst, 'reload schema';
