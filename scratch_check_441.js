const fs = require('fs');

const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO DIARIO ABRIL 2026.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

let found = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes(',441,')) {
    console.log(`L${i+1}: ${line}`);
    found = true;
  }
}
if (!found) {
  console.log("REF 441 not found in journal CSV.");
}
