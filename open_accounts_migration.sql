-- Script de Migración para el Soporte de Cuentas Abiertas (Mesas) en Café Yanaloma
-- Ejecutar este script en el SQL Editor de Supabase (https://supabase.com/dashboard)
-- para habilitar la columna de estado.

-- 1. Agregar columna 'estado' a la tabla 'transacciones'
ALTER TABLE transacciones 
ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'PAGADA' CHECK (estado IN ('PAGADA', 'PENDIENTE'));

-- Comentario documental en PostgreSQL
COMMENT ON COLUMN transacciones.estado IS 'Estado de la transacción: PAGADA (Finalizada y contabilizada) o PENDIENTE (Cuenta abierta acumulando consumos)';

-- 2. Recargar el caché de esquemas de PostgREST para aplicar los cambios inmediatamente
NOTIFY pgrst, 'reload schema';
