import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Faltan SUPABASE_URL / SUPABASE_ANON_KEY en las variables de entorno.");
}

export function createServerSupabaseClient() {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false },
  });
}
