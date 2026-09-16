"use client";

import { useActionState, useRef } from "react";
import { crearCompraInsumo, type InsumoState } from "@/app/actions/insumos";

const initialState: InsumoState = {};
const hoy = () => new Date().toISOString().slice(0, 10);

export function NuevoInsumoForm() {
  const [state, formAction, pending] = useActionState(crearCompraInsumo, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="grid grid-cols-2 gap-3 border-2 border-ink bg-cream-soft p-4 sm:grid-cols-4"
    >
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Fecha</label>
        <input
          name="fecha"
          type="date"
          defaultValue={hoy()}
          required
          disabled={pending}
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Detalle</label>
        <input
          name="detalle"
          required
          disabled={pending}
          placeholder="Ej: Leche deslactosada"
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Cantidad</label>
        <input
          name="cantidad"
          type="number"
          step="0.01"
          required
          disabled={pending}
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Medida</label>
        <input
          name="medida"
          disabled={pending}
          placeholder="UNIDAD, LITROS…"
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm uppercase text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
          Precio unit. (Bs)
        </label>
        <input
          name="precio_unitario"
          type="number"
          step="0.01"
          required
          disabled={pending}
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <div className="col-span-2">
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
          Respaldo (recibo / factura)
        </label>
        <input
          name="respaldo"
          disabled={pending}
          placeholder="Según factura N° … por …"
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Solicitante</label>
        <input
          name="solicitante"
          disabled={pending}
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="col-span-2 h-fit self-end border-2 border-ink bg-ink px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-gold-soft hover:bg-ink/90 disabled:opacity-60 sm:col-span-4"
      >
        {pending ? "Guardando…" : "Registrar compra"}
      </button>
      {state.error && (
        <p className="col-span-2 border-2 border-red-900/70 bg-red-900/5 px-3 py-2 text-xs font-semibold text-red-900 sm:col-span-4">
          {state.error}
        </p>
      )}
    </form>
  );
}
