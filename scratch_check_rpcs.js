const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://recpbqwsjbmcairosqny.supabase.co', 'sb_publishable_6z0K5wCa61POtgr1sT-MaQ_NprtxSnV');

async function main() {
  console.log("Testing RPC list or execution...");
  const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1' });
  console.log("exec_sql test:", { data, error });
  
  const { data: d2, error: e2 } = await supabase.rpc('execute_sql', { sql_query: 'SELECT 1' });
  console.log("execute_sql test:", { data: d2, error: e2 });
}
main();
