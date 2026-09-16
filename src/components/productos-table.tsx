"use client";

import { useActionState, useState } from "react";
import { actualizarProducto, eliminarProducto, type ProductoState } from "@/app/actions/productos";

type Producto = {
  id: number;
  nombre: string;
  categoria: string;
  precio_venta: number;
};

const initialState: ProductoState = {};

function ProductoRow({ producto }: { producto: Producto }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(actualizarProducto, initialState);
  const [deleting, setDeleting] = useState(false);

  if (editing) {
    return (
      <tr className="border-b border-ink/20 bg-gold/5">
        <td colSpan={3} className="p-2">
          <form
            action={async (fd) => {
              await formAction(fd);
              if (!state.error) setEditing(false);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="id" value={producto.id} />
            <input
              name="nombre"
              defaultValue={producto.nombre}
              required
              disabled={pending}
              className="min-w-0 flex-1 border-2 border-ink bg-cream px-2 py-1.5 text-sm text-ink outline-none focus:border-gold"
            />
            <input
              name="categoria"
              defaultValue={producto.categoria}
              required
              disabled={pending}
              className="w-44 border-2 border-ink bg-cream px-2 py-1.5 text-sm uppercase text-ink outline-none focus:border-gold"
            />
            <input
              name="precio_venta"
              type="number"
              step="0.01"
              defaultValue={producto.precio_venta}
              required
              disabled={pending}
              className="w-24 border-2 border-ink bg-cream px-2 py-1.5 text-right text-sm text-ink outline-none focus:border-gold"
            />
            <button
              type="submit"
              disabled={pending}
              className="border-2 border-ink bg-ink px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-gold-soft hover:bg-ink/90"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="border-2 border-ink px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-ink hover:bg-ink/5"
            >
              Cancelar
            </button>
            {state.error && <p className="w-full text-xs font-semibold text-red-900">{state.error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-ink/20 hover:bg-gold/5">
      <td className="px-3 py-2 text-sm text-ink">{producto.nombre}</td>
      <td className="px-3 py-2 text-right font-mono text-sm text-ink">
        {producto.precio_venta.toFixed(2)}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-2 text-[10px] font-bold uppercase tracking-[0.1em]">
          <button onClick={() => setEditing(true)} className="text-ink/70 hover:text-ink hover:underline">
            Editar
          </button>
          <button
            disabled={deleting}
            onClick={() => {
              if (confirm(`¿Eliminar "${producto.nombre}" del catálogo?`)) {
                setDeleting(true);
                eliminarProducto(producto.id);
              }
            }}
            className="text-red-900/70 hover:text-red-900 hover:underline disabled:opacity-50"
          >
            Eliminar
          </button>
        </div>
      </td>
    </tr>
  );
}

export function ProductosTable({ productos }: { productos: Producto[] }) {
  const porCategoria = new Map<string, Producto[]>();
  for (const p of productos) {
    if (!porCategoria.has(p.categoria)) porCategoria.set(p.categoria, []);
    porCategoria.get(p.categoria)!.push(p);
  }

  if (productos.length === 0) {
    return <p className="text-sm text-ink/60">Todavía no hay productos cargados.</p>;
  }

  return (
    <div className="space-y-6">
      {[...porCategoria.entries()].map(([categoria, items]) => (
        <div key={categoria} className="border-2 border-ink">
          <div className="border-b-2 border-ink bg-ink px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-gold-soft">
            {categoria} <span className="text-gold-soft/60">({items.length})</span>
          </div>
          <table className="w-full">
            <tbody>
              {items.map((p) => (
                <ProductoRow key={p.id} producto={p} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
