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
  'CAJA MONEDA NACIONAL': '1110101',
  'CAJA CHICA': '1110102',
  'BANCO BISA': '1110103',
  'VENTAS': '5010101',
  'SERVICIO DE TUESTE': '1160101',
  'CAFÉ TOSTADO': '1160102', 
  'MATERIA PRIMA (CAFÉ ORO VERDE)': '11501', 
  'INSUMOS ALIMENTICIOS': '11506', 
  'OGLIGACIONES CON EL PERSONAL': '2130103', 
  'PRODUCTOS DE LIMPIEZA': '11402',
  'SERVICIOS BÁSICOS': '12705',
  'SERVICIOS EXTERNOS': '12706', 
  'COMPRAS': '1130402', 
  'GAS LICUADO': '11701',
  'IT': '1160103', 
  'IT POR PAGAR': 'IT POR PAGAR', 
  'IVA': 'IVA', 
  'CREDITO FISCAL': '1130203', 
  'GASTOS ADMINISTRATIVOS': '40101', 
  'RESERVA MONEDA EXTRANJERA': '31503', 
  'INVENTARIO DE MERCADERIAS': '115', 
  'ACHUMANI': 'ACHUMANI 1', 
  'MUEBLES Y EQUIPOS DE OFICINA': '12404', 
  'CUENTAS POR PAGAR': '21103', 
  'IUE': '406', 
  'COMISIONES A LINKSER': '502030103', 
  'LINKSER': '502030102', 
  'MATERIAL DE ESCRITORIO': '11507', 
  'COSTO DE VENTAS Y SERVICIOS': '50102'
};

const codeToNameMap = {};
Object.entries(nameToCodeMap).forEach(([k, v]) => {
  codeToNameMap[v] = k;
});

async function run() {
  const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO MAYOR ABRIL 2026.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const csvLines = csvContent.split('\n');

  // Parse CSV totals
  const csvTotals = {};
  let currentAccount = null;
  csvLines.forEach(l => {
    const trimmed = l.trim();
    if (trimmed.endsWith(',,,,,') && !trimmed.includes('FECHA')) {
      const acc = trimmed.replace(/,+/g, '').trim();
      if (acc && acc !== 'LIBROS MAYORES' && !acc.startsWith('CIERRE') && !acc.startsWith('AABRIL')) {
        currentAccount = acc;
      }
    } else if (trimmed.startsWith('CIERRE MES DE') && currentAccount) {
      const parts = trimmed.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/);
      const debe = parseFloat(parts[3]?.replace(/^"|"$/g, '').replace(/\./g, '').replace(',', '.')) || 0;
      const haber = parseFloat(parts[4]?.replace(/^"|"$/g, '').replace(/\./g, '').replace(',', '.')) || 0;
      const saldo = parseFloat(parts[5]?.replace(/^"|"$/g, '').replace(/\./g, '').replace(',', '.')) || 0;
      csvTotals[currentAccount] = { debe, haber, saldo };
    }
  });

  const { data: dbCuentas } = await supabase.from('cuentas_contables').select('*');
  
  // Fetch paginated libro_diario
  let dbDiario = [];
  let page = 0;
  const pageSize = 1000;
  let keepFetching = true;
  while (keepFetching) {
    const { data, error } = await supabase.from('libro_diario')
      .select('*')
      .gte('fecha', '2026-04-01')
      .lte('fecha', '2026-04-30')
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (error) {
      console.error(error);
      break;
    }
    if (data && data.length > 0) {
      dbDiario = dbDiario.concat(data);
      if (data.length < pageSize) keepFetching = false;
      else page++;
    } else {
      keepFetching = false;
    }
  }

  console.log(`Total rows fetched from DB: ${dbDiario.length}`);

  // Group DB by account and sum
  const dbTotals = {};
  dbDiario.forEach(mov => {
    const code = mov.codigo_cuenta;
    const acc = dbCuentas.find(c => c.codigo === code);
    const accName = codeToNameMap[code] || acc?.nombre || 'DESCONOCIDA';
    
    if (!dbTotals[accName]) dbTotals[accName] = { debe: 0, haber: 0 };
    dbTotals[accName].debe += Number(mov.debe || 0);
    dbTotals[accName].haber += Number(mov.haber || 0);
  });

  // Print comparison table
  console.log(String('Account Name').padEnd(35) + ' | ' + String('CSV DEBE').padStart(12) + ' | ' + String('DB DEBE').padStart(12) + ' | ' + String('CSV HABER').padStart(12) + ' | ' + String('DB HABER').padStart(12));
  console.log('-'.repeat(95));
  
  Object.keys(csvTotals).forEach(acc => {
    const csv = csvTotals[acc];
    const db = dbTotals[acc] || { debe: 0, haber: 0 };
    
    const diffDebe = Math.abs(csv.debe - db.debe) > 0.05 ? ' *' : '';
    const diffHaber = Math.abs(csv.haber - db.haber) > 0.05 ? ' *' : '';
    
    console.log(
      acc.padEnd(35) + ' | ' +
      csv.debe.toFixed(2).padStart(12) + ' | ' +
      db.debe.toFixed(2).padStart(12) + diffDebe + ' | ' +
      csv.haber.toFixed(2).padStart(12) + ' | ' +
      db.haber.toFixed(2).padStart(12) + diffHaber
    );
  });
}

run();
