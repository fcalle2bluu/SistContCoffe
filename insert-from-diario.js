require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
  'OBLIGACIONES CON EL PERSONAL': '2130103',
  'PRODUCTOS DE LIMPIEZA': '11402',
  'SERVICIOS BÁSICOS': '12705',
  'SERVICIOS EXTERNOS': '12706', 
  'COMPRAS': '1130402', 
  'GAS LICUADO': '11701',
  'IT': '1160103', 
  'IT POR PAGAR': 'IT POR PAGAR', 
  'IVA': 'IVA', 
  'CREDITO FISCAL': '1130203', 
  'CRÉDITO FISCAL': '1130203',
  'GASTOS ADMINISTRATIVOS': '40101', 
  'RESERVA MONEDA EXTRANJERA': '31503', 
  'INVENTARIO DE MERCADERIAS': '115', 
  'INVENTARIOS': '115',
  'ACHUMANI': 'ACHUMANI 1', 
  'ACHUMANI 1': 'ACHUMANI 1',
  'ACHUMANI 2': 'ACHUMANI 2',
  'FACTURA ACHUMANI': 'FACTURA ACHUMANI',
  'MUEBLES Y EQUIPOS DE OFICINA': '12404', 
  'CUENTAS POR PAGAR': '21103', 
  'DEUDAS POR PAGAR': '21103',
  'IUE': '406', 
  'COMISIONES A LINKSER': '502030103', 
  'COMISIÓN A LINKSER': '502030103',
  'LINKSER': '502030102', 
  'MATERIAL DE ESCRITORIO': '11507', 
  'COSTO DE VENTAS Y SERVICIOS': '50102',
  'COSTO DE VENTA Y SERVICIOS': '50102',
  'RESULTADOS ACUMULADOS': '3160',
  'REAJUSTE': 'REAJUSTE',
  'OBLIGACIONES FISCALES': '2130102',
  'EQUIPOS DE COCINA': '12409',
  'OTRAS CUENTAS POR COBRAR': '1130206',
  'CAJA MONEDA EXTRANJERA': '11101'
};

function parseAmount(val) {
  if (!val) return 0;
  const clean = val.replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parseSpanishDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const day = parts[0].padStart(2, '0');
  const monthAbbr = parts[1].toLowerCase();
  const year = parts[2];
  
  const months = {
    'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
    'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
  };
  const month = months[monthAbbr] || '01';
  return `${year}-${month}-${day}`;
}

async function main() {
  // 1. Fetch accounts from database
  console.log("Fetching account codes from DB...");
  const { data: dbAccounts, error: errFetchCuentas } = await supabase.from('cuentas_contables').select('*');
  if (errFetchCuentas) {
    console.error("Error fetching accounts:", errFetchCuentas);
    return;
  }
  
  const dbAccountMap = {};
  dbAccounts.forEach(a => {
    dbAccountMap[a.nombre.trim().toUpperCase()] = a.codigo;
    dbAccountMap[a.codigo] = a.codigo;
  });

  // 2. Parse CSV
  console.log("Reading LIBRO DIARIO ABRIL 2026.csv...");
  const text = fs.readFileSync('LIBRO DIARIO ABRIL 2026.csv', 'utf8');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  const seats = [];
  let currentSeat = null;

  for (let l of lines) {
    const parts = l.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/).map(p => p ? p.trim().replace(/^\"|\"$/g, '') : '');
    if (parts.length < 3) continue;

    const isNewSeat = parts[0] && parts[0].match(/^\d{1,2}-[a-z]{3}-\d{4}/i) && parts[1] && !isNaN(parseInt(parts[1]));

    if (isNewSeat) {
      if (currentSeat) {
        seats.push(currentSeat);
      }
      currentSeat = {
        nro_asiento: parseInt(parts[1]),
        fecha: parseSpanishDate(parts[0]),
        movements: [],
        glosas: []
      };
    }

    if (!currentSeat) continue;

    const debe = parseAmount(parts[4]);
    const haber = parseAmount(parts[5]);

    if (debe > 0 && haber > 0) {
      if (parts[2] && parts[2] !== '') {
        currentSeat.glosas.push(parts[2]);
      }
      continue;
    }

    if (parts[2] && parts[2] !== '' && debe > 0) {
      currentSeat.movements.push({
        accountName: parts[2],
        debe: debe,
        haber: 0
      });
    }

    if (parts[3] && parts[3] !== '' && haber > 0) {
      currentSeat.movements.push({
        accountName: parts[3],
        debe: 0,
        haber: haber
      });
    }

    if (parts[2] && parts[2] !== '' && debe === 0 && haber === 0) {
      const weekdays = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
      if (!weekdays.includes(parts[2].toUpperCase())) {
        currentSeat.glosas.push(parts[2]);
      }
    }
  }

  if (currentSeat) {
    seats.push(currentSeat);
  }

  console.log(`Parsed ${seats.length} seats from CSV.`);

  // 3. Prepare inserts
  const inserts = [];
  const unmappedSet = new Set();

  for (const s of seats) {
    const glosaStr = s.glosas.join(' ').trim();
    for (const m of s.movements) {
      const nameUpper = m.accountName.toUpperCase().trim();
      let codigo_cuenta = null;

      // 3a. Check overrides first
      if (nameToCodeMap[nameUpper]) {
        codigo_cuenta = nameToCodeMap[nameUpper];
      } 
      // 3b. Check if starts with VENTA
      else if (/^VENTA\s+\d+$/i.test(nameUpper) || nameUpper === 'VENTA') {
        codigo_cuenta = '5010101'; // Ventas
      }
      // 3c. Check in DB accounts
      else if (dbAccountMap[nameUpper]) {
        codigo_cuenta = dbAccountMap[nameUpper];
      }
      // 3d. Partial match in DB accounts
      else {
        const partialMatch = dbAccounts.find(a => nameUpper.includes(a.nombre.toUpperCase()));
        if (partialMatch) {
          codigo_cuenta = partialMatch.codigo;
        } else {
          unmappedSet.add(nameUpper);
        }
      }

      if (codigo_cuenta) {
        inserts.push({
          fecha: s.fecha,
          nro_asiento: s.nro_asiento,
          codigo_cuenta: codigo_cuenta,
          glosa: glosaStr,
          debe: m.debe,
          haber: m.haber
        });
      } else {
        console.error(`ERROR: Could not map account name: "${m.accountName}"`);
      }
    }
  }

  if (unmappedSet.size > 0) {
    console.log("Unmapped Accounts:", Array.from(unmappedSet));
    console.error("Aborting insertion because there are unmapped accounts.");
    return;
  }

  console.log(`Prepared ${inserts.length} journal records to insert.`);

  // 4. Delete old entries for April 2026
  console.log("Deleting old entries from April 2026...");
  const { error: delError } = await supabase
    .from('libro_diario')
    .delete()
    .gte('fecha', '2026-04-01')
    .lte('fecha', '2026-04-30');
      
  if (delError) {
    console.error("Delete error:", delError);
    return;
  }
  
  console.log("Deleted old entries. Inserting new ones...");
  
  // 5. Insert in chunks
  const chunkSize = 100;
  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    const { error: insError } = await supabase.from('libro_diario').insert(chunk);
    if (insError) {
      console.error(`Error inserting chunk ${i}:`, JSON.stringify(insError, null, 2));
      return;
    } else {
      console.log(`Inserted ${i + chunk.length} / ${inserts.length}`);
    }
  }
  
  console.log("✅ Successfully imported all records from LIBRO DIARIO ABRIL 2026.csv!");
}

main();
