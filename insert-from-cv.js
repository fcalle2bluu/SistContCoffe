require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function parseAmount(val) {
  if (!val || val.trim() === '') return 0;
  const clean = val.replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parseDate(dateStr) {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = '20' + parts[2];
  return `${year}-${month}-${day}`;
}

async function main() {
  console.log("Reading LIBROS CONTABLES ABRIL 2026 - COMPRAS Y VENTAS ABRIL 2026.csv...");
  const text = fs.readFileSync('LIBROS CONTABLES ABRIL 2026 - COMPRAS Y VENTAS ABRIL 2026.csv', 'utf8');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  const transactions = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // Simple CSV parser supporting quotes
    const parts = l.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/).map(p => p ? p.trim().replace(/^\"|\"$/g, '') : '');
    if (parts.length < 5) continue;

    // Check if header line or empty row
    if (parts[0] === 'N°' || isNaN(parseInt(parts[0]))) continue;

    const nro = parseInt(parts[0]);
    const fecha = parseDate(parts[1]);
    const detalle = parts[2];
    const ingreso = parseAmount(parts[3]);
    const egreso = parseAmount(parts[4]);
    const caja = parseAmount(parts[5]);
    const c_chica = parseAmount(parts[6]);
    const banco = parseAmount(parts[7]);
    const pos = parseAmount(parts[8]);
    const tipo = parts[9] || '';
    const registrado = parts[10] || '';
    const v_sf_cchica = parseAmount(parts[11]);
    const v_sf_banco = parseAmount(parts[12]);
    const costo_cchica = parseAmount(parts[13]);
    const costo_banco = parseAmount(parts[14]);

    const isIngreso = ingreso > 0 || egreso === 0;
    const monto_total = isIngreso ? ingreso : egreso;
    const tipo_movimiento = isIngreso ? 'INGRESO' : 'EGRESO';

    let tiene_factura = tipo.toUpperCase().includes('FAC') || registrado.toUpperCase().includes('FAC');
    let metodo_pago = 'EFECTIVO';
    if (tipo.toUpperCase().includes('QR')) {
      metodo_pago = 'QR';
    } else if (tipo.toUpperCase().includes('POS')) {
      metodo_pago = 'POS';
    } else if (tipo.toUpperCase().includes('NOVEDAD')) {
      metodo_pago = 'EFECTIVO';
    }

    let categoria = 'Otros';
    let codigo_debe = '';
    let codigo_haber = '';

    const detailUpper = detalle.toUpperCase();

    if (isIngreso) {
      if (detailUpper.includes('SERVICIO DE TUESTE') || detailUpper.includes('SERVICIO DE MOLIDO') || detailUpper.includes('KG SERVICIO')) {
        categoria = 'Servicios';
        codigo_haber = '1160101'; // Servicio de Tueste
        codigo_debe = '1110103'; // Banco Bisa (asume QR/Banco)
      } else if (detailUpper.includes('CIERRE')) {
        categoria = 'Otros';
        codigo_debe = '1110102'; // Caja Chica
        codigo_haber = '1110102';
      } else {
        categoria = 'Ventas';
        codigo_haber = '5010101'; // Ventas
        if (metodo_pago === 'EFECTIVO') {
          codigo_debe = '1110102'; // Caja Chica
        } else {
          codigo_debe = '1110103'; // Banco Bisa
        }
      }
    } else {
      // Egreso
      if (detailUpper.includes('LUZ') || detailUpper.includes('SANITARIOS') || detailUpper.includes('HIGIENE') || detailUpper.includes('LURIGANCHO') || detailUpper.includes('COPACOBANA')) {
        categoria = 'Servicios básicos';
        codigo_debe = '12705';
      } else if (detailUpper.includes('LECHE') || detailUpper.includes('HUEVOS') || detailUpper.includes('PAN') || detailUpper.includes('TOMATE') || detailUpper.includes('PALTA') || detailUpper.includes('QUESO') || detailUpper.includes('GARRAFA') || detailUpper.includes('COCOA') || detailUpper.includes('INSUMOS') || detailUpper.includes('BARRA') || detailUpper.includes('COCINA') || detailUpper.includes('PASTELERIA') || detailUpper.includes('REPOSTERIA') || detailUpper.includes('DISPENSADORES') || detailUpper.includes('PAPEL')) {
        categoria = 'Insumos alimenticios';
        codigo_debe = '11506';
      } else if (detailUpper.includes('TRANSPORTE') || detailUpper.includes('LIMPIEZA') || detailUpper.includes('TRAPOS') || detailUpper.includes('VIDRIOS') || detailUpper.includes('FLETE')) {
        categoria = 'Costos secundarios';
        codigo_debe = '12706'; // Servicios externos / costos secundarios
      } else if (detailUpper.includes('OFICINA') || detailUpper.includes('REGLA') || detailUpper.includes('MARCADORES') || detailUpper.includes('HOJAS') || detailUpper.includes('LIBROS') || detailUpper.includes('IMPRESION')) {
        categoria = 'Costos secundarios';
        codigo_debe = '11507'; // Material de escritorio
      } else if (detailUpper.includes('HORAS EXTRA') || detailUpper.includes('PASAJES') || detailUpper.includes('PASANTIA') || detailUpper.includes('PERSONAL') || detailUpper.includes('SUELDO') || detailUpper.includes('PAGO A JUDYD')) {
        categoria = 'Mano de obra';
        codigo_debe = '2130103';
      } else if (detailUpper.includes('IUE')) {
        categoria = 'IT'; // O impuesto
        codigo_debe = '406';
      } else if (detailUpper.includes('IT')) {
        categoria = 'IT';
        codigo_debe = '1160103';
      } else if (detailUpper.includes('SEDES')) {
        categoria = 'Otros';
        codigo_debe = '2130102'; // Obligaciones Fiscales
      } else if (detailUpper.includes('MICROHONDAS') || detailUpper.includes('EQUIPO') || detailUpper.includes('EQUIPOS')) {
        categoria = 'Otros';
        codigo_debe = '12409';
      } else {
        categoria = 'Otros';
        codigo_debe = '40101';
      }

      if (metodo_pago === 'EFECTIVO') {
        codigo_haber = '1110102'; // Caja Chica
      } else {
        codigo_haber = '1110103'; // Banco Bisa
      }
    }

    transactions.push({
      fecha,
      detalle,
      tipo_movimiento,
      monto_total,
      caja,
      c_chica,
      banco,
      pos,
      metodo_pago,
      tiene_factura,
      v_sf_cchica,
      v_sf_banco,
      costo_cchica,
      costo_banco,
      categoria,
      mesa: detailUpper.includes('CIERRE') ? 'Cierre' : null,
      hora: null,
      responsable: detailUpper.includes('CIERRE') ? 'Cierre' : 'Caja',
      pago: monto_total,
      cambio: 0,
      observacion: null,
      tipo_pedido: 'SITIO',
      monto_descuento: 0,
      motivo_descuento: null,
      codigo_debe: codigo_debe || null,
      codigo_haber: codigo_haber || null
    });
  }

  console.log(`Parsed ${transactions.length} transactions.`);

  // Delete old transacciones in April 2026
  console.log("Deleting old April transacciones from DB...");
  const { error: delError } = await supabase
    .from('transacciones')
    .delete()
    .gte('fecha', '2026-04-01')
    .lte('fecha', '2026-04-30');

  if (delError) {
    console.error("Error deleting old transacciones:", delError);
    return;
  }

  console.log("Inserting new transacciones...");
  const chunkSize = 100;
  for (let i = 0; i < transactions.length; i += chunkSize) {
    const chunk = transactions.slice(i, i + chunkSize);
    const { error: insError } = await supabase.from('transacciones').insert(chunk);
    if (insError) {
      console.error(`Error inserting chunk starting at index ${i}:`, JSON.stringify(insError, null, 2));
      return;
    }
    console.log(`Inserted ${i + chunk.length} / ${transactions.length} transacciones.`);
  }

  console.log("✅ Successfully populated transacciones table from CSV without explicit IDs!");
}

main();
