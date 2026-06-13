require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('transacciones')
    .select('*')
    .gte('fecha', '2026-04-01')
    .lte('fecha', '2026-04-30')
    .order('id', { ascending: true })
    .limit(15);
  if (error) {
    console.error("Error querying transacciones:", error);
  } else {
    console.log("April transacciones details:");
    data.forEach(tx => {
      console.log(`ID: ${tx.id} | Fecha: ${tx.fecha} | Detalle: ${tx.detalle.substring(0, 30)} | Monto: ${tx.monto_total} | Debe: ${tx.codigo_debe} | Haber: ${tx.codigo_haber} | Tipo: ${tx.tipo_movimiento}`);
    });
  }
}

check();
