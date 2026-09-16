"use client";

import { useState } from "react";
import { cobrarOrdenPendiente, cancelarOrden } from "@/app/actions/ventas";

type Orden = { id: number; mesa: string; total: number; responsable: string; horaFormatted: string };

const TIPOS_PAGO = ["EFECTIVO", "QR", "POS", "EFEC/FAC", "QR/FAC"];

function CobrarRow({ orden }: { orden: Orden }) {
  const [cobrando, setCobrando] = useState(false);

  if (!cobrando) {
    return (
      <tr className="border-b border-ink/20 hover:bg-gold/5">
        <td className="px-3 py-2 text-sm font-bold text-ink">{orden.mesa}</td>
        <td className="px-3 py-2 text-right font-mono text-sm text-ink">Bs {Number(orden.total).toFixed(2)}</td>
        <td className="px-3 py-2 text-xs text-ink/60">{orden.responsable}</td>
        <td className="px-3 py-2 text-xs text-ink/60">{orden.horaFormatted}</td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-3 text-[10px] font-bold uppercase tracking-[0.1em]">
            <button onClick={() => setCobrando(true)} className="text-ink hover:underline">
              Cobrar
            </button>
            <button
              onClick={() => {
                if (confirm(`¿Cancelar el pedido de "${orden.mesa}"?`)) cancelarOrden(orden.id);
              }}
              className="text-red-900/70 hover:text-red-900 hover:underline"
            >
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-ink/20 bg-gold/5">
      <td colSpan={5} className="p-2">
        <form action={cobrarOrdenPendiente} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="orden_id" value={orden.id} />
          <span className="text-sm font-bold text-ink">{orden.mesa}</span>
          <span className="font-mono text-sm text-ink">Bs {Number(orden.total).toFixed(2)}</span>
          <select
            name="tipo_pago"
            required
            className="border-2 border-ink bg-cream px-2 py-1.5 text-sm text-ink outline-none focus:border-gold"
          >
            <option value="">Método de pago…</option>
            {TIPOS_PAGO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            name="monto_pagado"
            type="number"
            step="0.01"
            placeholder={Number(orden.total).toFixed(2)}
            className="w-24 border-2 border-ink bg-cream px-2 py-1.5 text-sm text-ink outline-none focus:border-gold"
          />
          <button
            type="submit"
            className="border-2 border-ink bg-ink px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-gold-soft hover:bg-ink/90"
          >
            Confirmar
          </button>
          <button
            type="button"
            onClick={() => setCobrando(false)}
            className="border-2 border-ink px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-ink hover:bg-ink/5"
          >
            Cancelar
          </button>
        </form>
      </td>
    </tr>
  );
}

export function OrdenesPendientes({ ordenes }: { ordenes: Orden[] }) {
  if (ordenes.length === 0) {
    return <p className="text-sm text-ink/60">No hay cuentas pendientes por cobrar.</p>;
  }

  return (
    <div className="overflow-x-auto border-2 border-ink">
      <table className="w-full min-w-[560px]">
        <thead>
          <tr className="border-b-2 border-ink bg-ink text-gold-soft">
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Mesa</th>
            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Total</th>
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Responsable</th>
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Hora</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {ordenes.map((o) => (
            <CobrarRow key={o.id} orden={o} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
