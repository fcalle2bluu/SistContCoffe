const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://recpbqwsjbmcairosqny.supabase.co', 'sb_publishable_6z0K5wCa61POtgr1sT-MaQ_NprtxSnV');

async function main() {
  const { data: prods, error: err1 } = await supabase.from('productos').select('*').order('id', { ascending: true });
  const { data: recetas, error: err2 } = await supabase.from('costos_recetas').select('*').order('id', { ascending: true });
  
  if (err1 || err2) {
    console.error("Errors:", err1, err2);
  } else {
    console.log("PRODUCTS IN DATABASE:", prods?.length);
    console.log(JSON.stringify(prods, null, 2));
    console.log("RECETAS IN DATABASE:", recetas?.length);
    console.log(JSON.stringify(recetas, null, 2));
  }
}
main();
