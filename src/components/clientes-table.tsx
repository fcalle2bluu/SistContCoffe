"use client";

import { eliminarCliente } from "@/app/actions/clientes";

type Cliente = {
  id: number;
  nombre: string;
  ci_nit: string | null;
  telefono: string | null;
};

export function ClientesTable({ clientes }: { clientes: Cliente[] }) {
  if (clientes.length === 0) {
    return <p className="text-sm text-ink/60">Todavía no hay clientes registrados.</p>;
  }

  return (
    <div className="overflow-x-auto border-2 border-ink">
      <table className="w-full min-w-[520px]">
        <thead>
          <tr className="border-b-2 border-ink bg-ink text-gold-soft">
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.2em]">
              Apellido / Razón social
            </th>
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.2em]">
              C.I. / NIT
            </th>
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.2em]">
              Teléfono
            </th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id} className="border-b border-ink/20 hover:bg-gold/5">
              <td className="px-3 py-2 text-sm text-ink">{c.nombre}</td>
              <td className="px-3 py-2 font-mono text-sm text-ink/80">{c.ci_nit || "—"}</td>
              <td className="px-3 py-2 font-mono text-sm text-ink/80">{c.telefono || "—"}</td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar a "${c.nombre}"?`)) eliminarCliente(c.id);
                  }}
                  className="text-[10px] font-bold uppercase tracking-[0.1em] text-red-900/70 hover:text-red-900 hover:underline"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
