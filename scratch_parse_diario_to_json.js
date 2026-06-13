const fs = require('fs');
const path = require('path');

const csvPath = 'LIBRO DIARIO ABRIL 2026.csv';
if (!fs.existsSync(csvPath)) {
  console.error("CSV file not found!");
  process.exit(1);
}

const text = fs.readFileSync(csvPath, 'utf8');
const lines = text.split(/\r?\n/);

const headerRows = [];
const seats = [];
let currentSeat = null;

// The first 6 rows are the sheet header
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line && i === lines.length - 1) continue; // Skip last trailing empty line
  
  // Split by comma, handling quotes
  const parts = line.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/).map(p => p ? p.trim().replace(/^\"|\"$/g, '') : '');
  
  if (i < 6) {
    headerRows.push(parts);
    continue;
  }

  const dateCol = parts[0];
  const seatCol = parts[1];
  
  const isNewSeat = dateCol && dateCol.match(/^\d{1,2}-[a-z]{3}-\d{4}/i) && seatCol && !isNaN(parseInt(seatCol));
  
  if (isNewSeat) {
    if (currentSeat) {
      seats.push(currentSeat);
    }
    currentSeat = {
      nro_asiento: parseInt(seatCol),
      fecha: dateCol,
      rows: [],
      searchText: ''
    };
  }
  
  if (currentSeat) {
    currentSeat.rows.push(parts);
    currentSeat.searchText += ' ' + parts.join(' ').toLowerCase();
  } else {
    // If somehow a row is found before the first seat but after the header
    headerRows.push(parts);
  }
}

if (currentSeat) {
  seats.push(currentSeat);
}

// Make sure output folder exists
const outDir = path.join('src', 'lib', 'data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(path.join(outDir, 'libro_diario_abril_2026.json'), JSON.stringify({ headerRows, seats }, null, 2));
console.log(`Successfully parsed ${seats.length} seats. Saved to src/lib/data/libro_diario_abril_2026.json`);
