const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: periods } = await supabase.from('periodos_contables').select('*');
  const april2026 = periods.find(p => p.nombre.includes('ABRIL 2026') || p.nombre.includes('Abril 2026'));
  
  const { data: dbDiario } = await supabase.from('libro_diario')
    .select('*')
    .eq('nro_asiento', 9999)
    .gte('fecha', april2026.fecha_inicio)
    .lte('fecha', april2026.fecha_fin);

  console.log(`Found ${dbDiario.length} entries with nro_asiento = 9999:`);
  dbDiario.forEach(r => {
    console.log(`ID: ${r.id}, Date: ${r.fecha}, Account: ${r.codigo_cuenta}, Glosa: ${r.glosa}, Debe: ${r.debe}, Haber: ${r.haber}`);
  });
}

run();
