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

const nameToCodeMap = {
  'CAJA MONEDA NACIONAL': '1110101'
};

async function run() {
  const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO MAYOR ABRIL 2026.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvLines = csvContent.split('\n');

  const csvRows = [];
  let currentAccount = null;
  csvLines.forEach((l, idx) => {
    const trimmed = l.trim();
    if (trimmed.endsWith(',,,,,') && !trimmed.includes('FECHA')) {
      const acc = trimmed.replace(/,+/g, '').trim();
      if (acc && acc !== 'LIBROS MAYORES' && !acc.startsWith('CIERRE') && !acc.startsWith('AABRIL')) {
        currentAccount = acc;
      }
    } else if (trimmed.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) && currentAccount === 'CAJA MONEDA NACIONAL') {
      csvRows.push({ lineNum: idx + 1, raw: trimmed });
    }
  });

  const { data: dbDiario } = await supabase.from('libro_diario')
    .select('*')
    .eq('codigo_cuenta', '1110101')
    .order('fecha', { ascending: true })
    .order('nro_asiento', { ascending: true });

  console.log("=== CSV Rows (21 total) ===");
  csvRows.forEach(r => console.log(`L${r.lineNum}: ${r.raw}`));

  console.log("\n=== DB Rows (15 total) ===");
  dbDiario.forEach(r => console.log(`Asiento: ${r.nro_asiento}, Fecha: ${r.fecha}, Glosa: ${r.glosa}, Debe: ${r.debe}, Haber: ${r.haber}`));
}

run();
