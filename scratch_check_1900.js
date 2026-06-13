const fs = require('fs');

const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO MAYOR ABRIL 2026.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('/1900')) {
    console.log(`L${i+1}: ${line}`);
  }
}
