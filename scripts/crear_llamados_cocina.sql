-- "Llamar a cocina": el cajero llama desde la web y la app de cocina responde "Ya voy".
CREATE TABLE IF NOT EXISTS llamados_cocina (
    id          serial PRIMARY KEY,
    llamado_por text NOT NULL,
    creado_en   timestamptz NOT NULL DEFAULT now(),
    cancelado   boolean NOT NULL DEFAULT false,
    visto_por   text,
    visto_en    timestamptz
);
CREATE INDEX IF NOT EXISTS llamados_cocina_creado_en_idx ON llamados_cocina (creado_en);
ALTER TABLE llamados_cocina ENABLE ROW LEVEL SECURITY;
