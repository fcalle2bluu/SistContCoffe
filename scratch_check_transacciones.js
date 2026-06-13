require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('transacciones')
    .select('id, fecha')
    .gte('fecha', '2026-04-01')
    .lte('fecha', '2026-04-30');
  if (error) {
    console.error("Error querying transacciones:", error);
  } else {
    console.log("Found April transacciones count:", data.length);
  }
}

check();
