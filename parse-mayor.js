require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
    const { data: accounts, error } = await supabase.from('cuentas_contables').select('*');
    if (error) {
        console.error("Error fetching accounts:", error);
        return;
    }
    
    const accountMap = {};
    accounts.forEach(a => {
        accountMap[a.nombre.trim().toUpperCase()] = a.codigo;
    });

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
            let accountName = currentAccountName;
            let codigo_cuenta = accountMap[accountName.toUpperCase()] || null;
            
            if (!codigo_cuenta) {
                if (accountName.toUpperCase() === 'VENTAS') {
                    codigo_cuenta = '5010101';
                } else if (accountName.toUpperCase() === 'COSTO DE VENTAS Y SERVICIOS') {
                    codigo_cuenta = '50102'; // Verify this matches their DB
                } else {
                    const match = accounts.find(a => a.nombre.toUpperCase() === accountName.toUpperCase());
                    if (match) codigo_cuenta = match.codigo;
                    else {
                         const partialMatch = accounts.find(a => accountName.toUpperCase().includes(a.nombre.toUpperCase()));
                         if (partialMatch) codigo_cuenta = partialMatch.codigo;
                         else {
                             if (!unmappedSet.has(accountName.toUpperCase())) {
                                 unmappedSet.add(accountName.toUpperCase());
                             }
                             codigo_cuenta = 'PENDING';
                         }
                    }
                }
            }
        }
    }
    console.log('Unmapped Accounts:', [...unmappedSet]);
}
main();
