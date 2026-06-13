const fs = require('fs');

const csvPath = '/home/asus/Documents/SistContCoffe/LIBRO MAYOR ABRIL 2026.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const lines = content.split('\n');

const refs = ['443', '455', '463'];
refs.forEach(ref => {
  console.log(`--- Searching for REF ${ref} ---`);
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // check if the second column matches the ref (using comma split)
    const parts = line.split(',');
    if (parts[1] === ref) {
      console.log(`L${i+1}: ${line}`);
      found = true;
    }
  }
  if (!found) {
    console.log(`REF ${ref} not found in CSV.`);
  }
});
