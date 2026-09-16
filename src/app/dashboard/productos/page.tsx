import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProductosTable } from "@/components/productos-table";
import { NuevoProductoForm } from "@/components/nuevo-producto-form";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  const supabase = createServerSupabaseClient();
  const { data: productos, error } = await supabase
    .from("productos")
    .select("id, nombre, categoria, precio_venta")
    .order("categoria")
    .order("nombre");

  const categorias = [...new Set((productos ?? []).map((p) => p.categoria))].sort();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl italic text-gold">Catálogo de productos</h2>
        <p className="text-sm text-ink/60">
          Precios y categorías — reemplaza la cadena de fórmulas IF() de la planilla de Excel.
        </p>
      </div>

      <NuevoProductoForm categoriasExistentes={categorias} />

      {error ? (
        <p className="border-2 border-red-900/70 bg-red-900/5 px-3 py-2 text-xs font-semibold text-red-900">
          Error: {error.message}
        </p>
      ) : (
        <ProductosTable productos={productos ?? []} />
      )}
    </div>
  );
}
