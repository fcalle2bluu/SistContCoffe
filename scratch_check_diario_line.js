const fs = require('fs');

const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO DIARIO ABRIL 2026.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes(',443,')) {
    console.log(`L${i+1}: ${line}`);
    // print surrounding lines
    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 5); j++) {
      console.log(`  L${j+1}: ${lines[j]}`);
    }
  }
}
