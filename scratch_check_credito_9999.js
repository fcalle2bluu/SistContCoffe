const fs = require('fs');

const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO MAYOR ABRIL 2026.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

let printing = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('CREDITO FISCAL')) {
    printing = true;
  }
  if (printing) {
    if (line.includes('#REF!')) {
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 5); j++) {
        console.log(`L${j+1}: ${lines[j]}`);
      }
      break;
    }
  }
}
