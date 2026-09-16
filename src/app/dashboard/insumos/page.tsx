import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NuevoInsumoForm } from "@/components/nuevo-insumo-form";
import { InsumosTable } from "@/components/insumos-table";

export const dynamic = "force-dynamic";

export default async function InsumosPage() {
  const supabase = createServerSupabaseClient();
  const { data: insumos, error } = await supabase
    .from("compras_insumos")
    .select("id, fecha, detalle, cantidad, medida, respaldo, precio_unitario, total, solicitante, responsable")
    .order("fecha", { ascending: false })
    .order("id", { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl italic text-gold">Control de insumos</h2>
        <p className="text-sm text-ink/60">
          Registro de abastecimiento: insumo, respaldo (factura/recibo) y costo.
        </p>
      </div>

      <NuevoInsumoForm />

      {error ? (
        <p className="border-2 border-red-900/70 bg-red-900/5 px-3 py-2 text-xs font-semibold text-red-900">
          Error: {error.message}
        </p>
      ) : (
        <InsumosTable insumos={insumos ?? []} />
      )}
    </div>
  );
}
