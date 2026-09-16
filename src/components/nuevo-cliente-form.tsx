"use client";

import { useActionState, useRef } from "react";
import { crearCliente, type ClienteState } from "@/app/actions/clientes";

const initialState: ClienteState = {};

export function NuevoClienteForm() {
  const [state, formAction, pending] = useActionState(crearCliente, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="grid grid-cols-1 gap-3 border-2 border-ink bg-cream-soft p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
    >
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
          Apellido / Razón social
        </label>
        <input
          name="nombre"
          required
          disabled={pending}
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
          C.I. / NIT
        </label>
        <input
          name="ci_nit"
          disabled={pending}
          className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
        />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
          Teléfono / Cel
        </label>
        <input
          name="telefono"
          disabled={pending}
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
