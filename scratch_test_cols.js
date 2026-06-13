const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://recpbqwsjbmcairosqny.supabase.co', 'sb_publishable_6z0K5wCa61POtgr1sT-MaQ_NprtxSnV');

async function main() {
  const { data, error } = await supabase.from('transacciones').select('id, mesa, hora, responsable, pago, cambio, observacion').limit(5);
  if (error) {
    console.error("Error selecting columns:", error.message);
  } else {
    console.log("Selected successfully! Rows:", data);
  }
}
main();
