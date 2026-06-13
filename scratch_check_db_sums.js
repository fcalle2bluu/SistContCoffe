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
  const { data: dbDiario } = await supabase.from('libro_diario')
    .select('*')
    .gte('fecha', '2026-04-01')
    .lte('fecha', '2026-04-30');

  const { data: dbCuentas } = await supabase.from('cuentas_contables').select('*');

  console.log(`Total rows in DB: ${dbDiario.length}`);

  const summary = {};
  dbDiario.forEach(mov => {
    const code = mov.codigo_cuenta;
    if (!summary[code]) {
      const acc = dbCuentas.find(c => c.codigo === code);
      summary[code] = {
        name: acc ? acc.nombre : 'UNKNOWN',
        count: 0,
        debe: 0,
        haber: 0
      };
    }
    summary[code].count++;
    summary[code].debe += Number(mov.debe || 0);
    summary[code].haber += Number(mov.haber || 0);
  });

  console.log(JSON.stringify(summary, null, 2));
}

run();
