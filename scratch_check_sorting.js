const fs = require('fs');

const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO MAYOR ABRIL 2026.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

const csvGrouped = {};
let currentAccount = null;
lines.forEach(l => {
  const trimmed = l.trim();
  if (trimmed.endsWith(',,,,,') && !trimmed.includes('FECHA')) {
    const acc = trimmed.replace(/,+/g, '').trim();
    if (acc && acc !== 'LIBROS MAYORES' && !acc.startsWith('CIERRE') && !acc.startsWith('AABRIL')) {
      currentAccount = acc;
      csvGrouped[acc] = [];
    }
  } else if (trimmed.match(/^\d{1,2}\/\d{1,2}\/\d{4}/) && currentAccount) {
    const parts = l.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/);
    const ref = parseInt(parts[1]) || 9999;
    csvGrouped[currentAccount].push({ ref, raw: trimmed });
  }
});

Object.entries(csvGrouped).forEach(([acc, movements]) => {
  // check if movements are sorted by ref ascending
  let isSortedByRef = true;
  for (let i = 1; i < movements.length; i++) {
    if (movements[i].ref < movements[i-1].ref) {
      isSortedByRef = false;
      break;
    }
  }
  console.log(`${acc}: movements count = ${movements.length}, sorted by ref = ${isSortedByRef}`);
  if (!isSortedByRef) {
    console.log("  Order of refs:", movements.map(m => m.ref).join(', '));
  }
});
