const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://recpbqwsjbmcairosqny.supabase.co', 'sb_publishable_6z0K5wCa61POtgr1sT-MaQ_NprtxSnV');

const packagingItems = [
  { nombre: 'Insumo: Vaso de Cartón', categoria: 'Insumos de Empaque', precio_venta: 0.00, es_inventariable: true },
  { nombre: 'Insumo: Bolsa de Papel', categoria: 'Insumos de Empaque', precio_venta: 0.00, es_inventariable: true }
];

async function main() {
  console.log("Checking if packaging items exist...");
  const { data: existing, error: checkErr } = await supabase
    .from('productos')
    .select('*')
    .eq('categoria', 'Insumos de Empaque');
    
  if (checkErr) {
    console.error("Check Error:", checkErr);
    return;
  }

  if (existing && existing.length > 0) {
    console.log("Packaging items already exist:", existing);
  } else {
    console.log("Inserting packaging items...");
    const { data: inserted, error: insErr } = await supabase
      .from('productos')
      .insert(packagingItems)
      .select();
      
    if (insErr) {
      console.error("Insert Error:", insErr);
    } else {
      console.log("Successfully inserted packaging items:", inserted);
    }
  }
}
main();
