-- Casilla "Es apertura" del Libro Diario: los asientos de apertura (saldo del mes anterior)
-- van siempre primero en su mes. Se marcan los que ya existen (glosa "Por inicio del mes…").
ALTER TABLE libro_diario ADD COLUMN IF NOT EXISTS es_apertura boolean NOT NULL DEFAULT false;
UPDATE libro_diario SET es_apertura = true WHERE glosa ILIKE 'Por inicio del mes%' AND NOT es_apertura;
