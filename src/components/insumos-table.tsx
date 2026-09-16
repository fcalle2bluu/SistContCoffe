"use client";

import { eliminarCompraInsumo } from "@/app/actions/insumos";

type Insumo = {
  id: number;
  fecha: string;
  detalle: string;
  cantidad: number;
  medida: string | null;
  respaldo: string | null;
  precio_unitario: number;
  total: number;
  solicitante: string | null;
  responsable: string | null;
};

function formatFecha(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function InsumosTable({ insumos }: { insumos: Insumo[] }) {
  if (insumos.length === 0) {
    return <p className="text-sm text-ink/60">Todavía no hay compras registradas.</p>;
  }

  const totalGeneral = insumos.reduce((acc, i) => acc + Number(i.total), 0);

  return (
    <div className="overflow-x-auto border-2 border-ink">
      <table className="w-full min-w-[820px]">
        <thead>
          <tr className="border-b-2 border-ink bg-ink text-gold-soft">
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Fecha</th>
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Detalle</th>
            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Cant.</th>
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Medida</th>
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Respaldo</th>
            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.15em]">P. Unit.</th>
            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Total</th>
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Solicitante</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {insumos.map((i) => (
            <tr key={i.id} className="border-b border-ink/20 hover:bg-gold/5">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-sm text-ink/80">
                {formatFecha(i.fecha)}
              </td>
              <td className="px-3 py-2 text-sm text-ink">{i.detalle}</td>
              <td className="px-3 py-2 text-right font-mono text-sm text-ink">{i.cantidad}</td>
              <td className="px-3 py-2 text-xs uppercase text-ink/70">{i.medida || "—"}</td>
              <td className="max-w-[220px] truncate px-3 py-2 text-xs text-ink/60" title={i.respaldo || ""}>
                {i.respaldo || "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm text-ink">
                {Number(i.precio_unitario).toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-sm font-bold text-ink">
                {Number(i.total).toFixed(2)}
              </td>
              <td className="px-3 py-2 text-xs text-ink/70">{i.solicitante || "—"}</td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar la compra de "${i.detalle}"?`)) eliminarCompraInsumo(i.id);
                  }}
                  className="text-[10px] font-bold uppercase tracking-[0.1em] text-red-900/70 hover:text-red-900 hover:underline"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink bg-gold/10 font-bold">
            <td colSpan={6} className="px-3 py-2 text-right text-xs uppercase tracking-[0.15em] text-ink">
              Total gastado
            </td>
            <td className="px-3 py-2 text-right font-mono text-sm text-ink">
              {totalGeneral.toFixed(2)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
