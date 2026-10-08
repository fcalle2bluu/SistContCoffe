ALTER TABLE compras_insumos ADD COLUMN IF NOT EXISTS cantidad_final numeric(12,3);  -- lo que queda del insumo (uso = cantidad − cantidad_final)
