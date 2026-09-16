import { createServerSupabaseClient } from "@/lib/supabase/server";

// Esta pantalla consulta datos en vivo en cada request; sin esto Next.js
// la generaría como HTML estático en build time (ver AGENTS.md / Cache Components).
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createServerSupabaseClient();
  const { data: usuarios, error } = await supabase
    .from("usuarios")
    .select("username, role")
    .order("id");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-stone-950 p-8 font-sans text-stone-100">
      <div className="w-full max-w-md rounded-2xl border border-stone-800 bg-stone-900 p-8 shadow-xl">
        <h1 className="text-xl font-bold tracking-tight">Café Yanaloma</h1>
        <p className="mt-1 text-sm text-stone-400">
          Proyecto reiniciado. Base de datos y despliegue conservados; el código de la aplicación arranca desde cero.
        </p>

        <div className="mt-6 rounded-xl border border-stone-800 bg-stone-950 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Verificación de conexión (Server Component → Supabase)
          </p>
          {error ? (
            <p className="mt-2 text-sm text-red-400">Error: {error.message}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-emerald-400">
              {usuarios?.map((u) => (
                <li key={u.username}>
                  ✓ {u.username} ({u.role})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
