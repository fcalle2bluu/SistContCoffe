const fs = require('fs');

const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO MAYOR ABRIL 2026.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

let printing = false;
let count = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('CREDITO FISCAL')) {
    printing = true;
    console.log(`--- FOUND CREDITO FISCAL START AT L${i+1} ---`);
  }
  if (printing) {
    console.log(`L${i+1}: ${line}`);
    count++;
    if (line.includes('CIERRE MES DE') || line.includes('INSUMOS ALIMENTICIOS') || count > 60) {
      break;
    }
  }
}
