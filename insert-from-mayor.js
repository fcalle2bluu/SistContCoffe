require('dotenv').config();
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

async function main() {
    // 1. Fetch all accounts currently in the DB
    const { data: accounts, error: errFetchCuentas } = await supabase.from('cuentas_contables').select('*');
    if (errFetchCuentas) {
        console.error("Error fetching accounts:", errFetchCuentas);
        return;
    }
    
    const accountMap = {};
    accounts.forEach(a => {
        accountMap[a.nombre.trim().toUpperCase()] = a.codigo;
        accountMap[a.codigo] = a.codigo; // map code to code too
    });

    // 2. Make sure 12706 (SERVICIOS EXTERNOS) exists in the database
    if (!accountMap['12706']) {
        console.log("Inserting missing account: 12706 (SERVICIOS EXTERNOS)...");
        const { error: insErr } = await supabase.from('cuentas_contables').insert({
            codigo: '12706',
            nombre: 'SERVICIOS EXTERNOS',
            tipo: 'ACTIVO'
        });
        if (insErr) {
            console.error("Error inserting SERVICIOS EXTERNOS:", insErr);
        } else {
            console.log("Successfully inserted SERVICIOS EXTERNOS (12706) account.");
            accountMap['SERVICIOS EXTERNOS'] = '12706';
            accountMap['12706'] = '12706';
        }
    }

    // Also check for any other missing accounts and insert them with a valid type
    const requiredCuentas = [
        { codigo: 'IT POR PAGAR', nombre: 'IT POR PAGAR', tipo: 'ACTIVO' },
        { codigo: 'IVA', nombre: 'IVA', tipo: 'ACTIVO' }
    ];
    for (const req of requiredCuentas) {
        if (!accountMap[req.codigo]) {
            console.log(`Inserting missing account: ${req.codigo}...`);
            const { error: insErr } = await supabase.from('cuentas_contables').insert(req);
            if (insErr) console.error(`Error inserting ${req.codigo}:`, insErr);
            else accountMap[req.codigo] = req.codigo;
        }
    }

    const text = fs.readFileSync('Copia de LIBROS CONTABLES ABRIL 2026 - LIBRO MAYOR ABRIL 2026.csv', 'utf8');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    let currentAccountName = null;
    const inserts = [];
    const unmappedSet = new Set();

    for (let l of lines) {
        if (l.endsWith(',,,,,') && !l.includes('FECHA')) {
            const acc = l.replace(/,+/g, '').trim();
            if (acc && acc !== 'LIBROS MAYORES' && !acc.startsWith('CIERRE') && !acc.startsWith('AABRIL')) {
                currentAccountName = acc;
            }
        } else if (l.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) && currentAccountName) {
            const parts = l.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/);
            const fechaStr = parts[0];
            let nroAsiento = parseInt(parts[1]);
            if (isNaN(nroAsiento)) nroAsiento = 9999;
            const glosa = parts[2] ? parts[2].replace(/^"|"$/g, '') : '';
            const debeCol = parts[3] ? parts[3].replace(/^"|"$/g, '').replace(/\./g, '').replace(',', '.') : '';
            const haberCol = parts[4] ? parts[4].replace(/^"|"$/g, '').replace(/\./g, '').replace(',', '.') : '';
            
            const debe = debeCol ? parseFloat(debeCol) : 0;
            const haber = haberCol ? parseFloat(haberCol) : 0;
            
            const [day, month, year] = fechaStr.split('/');
            const fechaIso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            
            let accountName = currentAccountName;
            
            // Resolve account code using nameToCodeMap, then database match
            let codigo_cuenta = nameToCodeMap[accountName.trim().toUpperCase()] || accountMap[accountName.trim().toUpperCase()] || null;
            
            if (!codigo_cuenta) {
                const match = accounts.find(a => a.nombre.toUpperCase() === accountName.toUpperCase());
                if (match) {
                    codigo_cuenta = match.codigo;
                } else {
                     const partialMatch = accounts.find(a => accountName.toUpperCase().includes(a.nombre.toUpperCase()));
                     if (partialMatch) {
                         codigo_cuenta = partialMatch.codigo;
                     } else {
                         if (!unmappedSet.has(accountName.toUpperCase())) {
                             console.log(`Auto-creating missing account: ${accountName.toUpperCase()}`);
                             unmappedSet.add(accountName.toUpperCase());
                             
                             const generatedCode = '999' + Math.floor(Math.random() * 10000);
                             const { error: accError } = await supabase.from('cuentas_contables').insert({
                                 codigo: generatedCode,
                                 nombre: accountName.toUpperCase(),
                                 tipo: 'ACTIVO' // Valid check constraint value
                             });
                             if (accError) {
                                 console.error('Error inserting account:', accError);
                             } else {
                                 accountMap[accountName.toUpperCase()] = generatedCode;
                             }
                         }
                         codigo_cuenta = accountMap[accountName.toUpperCase()];
                     }
                }
            }
            
            if (codigo_cuenta) {
                inserts.push({
                    fecha: fechaIso,
                    nro_asiento: nroAsiento,
                    codigo_cuenta: codigo_cuenta,
                    glosa: glosa,
                    debe: debe,
                    haber: haber
                });
            } else {
                console.error(`Could not map account: ${accountName}`);
            }
        }
    }
    
    console.log(`Found ${inserts.length} lines to insert from Libro Mayor.`);
    
    // Deleting old entries first
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
    
    const chunkSize = 100;
    for (let i = 0; i < inserts.length; i += chunkSize) {
        const chunk = inserts.slice(i, i + chunkSize);
        const { error: insError } = await supabase.from('libro_diario').insert(chunk);
        if (insError) {
            console.error(`Error inserting chunk ${i}:`, JSON.stringify(insError, null, 2));
        } else {
            console.log(`Inserted ${i + chunk.length} / ${inserts.length}`);
        }
    }
    
    console.log("Done!");
}

main();
