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
  const { data } = await supabase.from('libro_diario')
    .select('*')
    .eq('nro_asiento', 9999);

  console.log(`Found ${data.length} entries with nro_asiento = 9999:`);
  data.forEach(r => {
    console.log(`ID: ${r.id}, Date: ${r.fecha}, Account: ${r.codigo_cuenta}, Glosa: ${r.glosa}, Debe: ${r.debe}, Haber: ${r.haber}`);
  });
}

run();
