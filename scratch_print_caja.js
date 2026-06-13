const fs = require('fs');

const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO MAYOR ABRIL 2026.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

let printing = false;
let count = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('CAJA MONEDA NACIONAL')) {
    printing = true;
  }
  if (printing) {
    console.log(`L${i+1}: ${line}`);
    count++;
    if (count > 40) break; // limit output
  }
  if (printing && line.includes('CAJA CHICA')) {
    break;
  }
}
