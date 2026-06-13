const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://recpbqwsjbmcairosqny.supabase.co', 'sb_publishable_6z0K5wCa61POtgr1sT-MaQ_NprtxSnV');

async function main() {
  const tables = ['transacciones', 'productos', 'movimientos_inventario'];
  for (const table of tables) {
    console.log(`\n--- COLUMNS IN ${table} ---`);
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error(`Error querying ${table}:`, error.message);
    } else if (data && data.length > 0) {
      console.log(Object.keys(data[0]));
    } else {
      console.log(`Table ${table} is empty, let's try to insert null and read columns or describe.`);
      // We can query using postgres RPC or just look up a dummy query
      const { data: cols, error: colErr } = await supabase.rpc('get_table_columns', { table_name: table });
      if (colErr) console.error("Col err:", colErr.message);
      else console.log(cols);
    }
  }
}
main();
