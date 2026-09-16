import "server-only";
import { createClient } from "@supabase/supabase-js";

// Se leen en tiempo de ejecución (no al cargar el módulo) para que el build
// de Next.js no falle recolectando datos de página antes de que existan
// como Fly secret en runtime.
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_ANON_KEY en las variables de entorno.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
}
