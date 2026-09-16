"use client";

import { useActionState, useRef } from "react";
import { crearProducto, type ProductoState } from "@/app/actions/productos";

const initialState: ProductoState = {};

export function NuevoProductoForm({ categoriasExistentes }: { categoriasExistentes: string[] }) {
  const [state, formAction, pending] = useActionState(crearProducto, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="grid grid-cols-1 gap-3 border-2 border-ink bg-cream-soft p-4 sm:grid-cols-[2fr_1.5fr_1fr_auto] sm:items-end"
    >
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
          Producto
        </label>
        <input
          name="nombre"
          required
          disabled={pending}
          placeholder="Ej: Cappuccino"
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
          Categoría
        </label>
        <input
          name="categoria"
          required
          disabled={pending}
          list="categorias-existentes"
          placeholder="Ej: CAFÉ CALIENTE"
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm uppercase text-ink outline-none focus:border-gold disabled:opacity-60"
        />
        <datalist id="categorias-existentes">
          {categoriasExistentes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
          Precio (Bs)
        </label>
        <input
          name="precio_venta"
          type="number"
          step="0.01"
          required
          disabled={pending}
          placeholder="0.00"
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-fit border-2 border-ink bg-ink px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-gold-soft hover:bg-ink/90 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Añadir"}
      </button>
      {state.error && (
        <p className="sm:col-span-4 border-2 border-red-900/70 bg-red-900/5 px-3 py-2 text-xs font-semibold text-red-900">
          {state.error}
        </p>
      )}
    </form>
  );
}
