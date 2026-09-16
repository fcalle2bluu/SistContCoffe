import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NuevoClienteForm } from "@/components/nuevo-cliente-form";
import { ClientesTable } from "@/components/clientes-table";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const supabase = createServerSupabaseClient();
  const { data: clientes, error } = await supabase
    .from("clientes")
    .select("id, nombre, ci_nit, telefono")
    .order("nombre");

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl italic text-gold">Clientes</h2>
        <p className="text-sm text-ink/60">Datos para facturación recurrente.</p>
      </div>

      <NuevoClienteForm />

      {error ? (
        <p className="border-2 border-red-900/70 bg-red-900/5 px-3 py-2 text-xs font-semibold text-red-900">
          Error: {error.message}
        </p>
      ) : (
        <ClientesTable clientes={clientes ?? []} />
      )}
    </div>
  );
}
