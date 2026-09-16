"use client";

import { useActionState, useState } from "react";
import { abrirTurno, cerrarTurno, registrarMovimientoCaja, type VentaState } from "@/app/actions/ventas";

const initial: VentaState = {};

type Turno = {
  id: number;
  responsable: string;
  monto_inicial: number;
  abiertoEnFormatted: string;
};

export function TurnoPanel({
  turno,
  ingresosEfectivo,
  egresosEfectivo,
  ventasTotales,
}: {
  turno: Turno | null;
  ingresosEfectivo: number;
  egresosEfectivo: number;
  ventasTotales: number;
}) {
  const [openState, openAction, openPending] = useActionState(abrirTurno, initial);
  const [closeState, closeAction, closePending] = useActionState(cerrarTurno, initial);
  const [egresoState, egresoAction, egresoPending] = useActionState(registrarMovimientoCaja, initial);
  const [showCierre, setShowCierre] = useState(false);
  const [showEgreso, setShowEgreso] = useState(false);

  if (!turno) {
    return (
      <div className="border-2 border-ink bg-cream-soft p-5">
        <h3 className="font-serif text-lg italic text-gold">No hay turno abierto</h3>
        <p className="mt-1 text-sm text-ink/60">Abre caja para empezar a registrar ventas.</p>
        <form action={openAction} className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
              Monto inicial en caja (Bs)
            </label>
            <input
              name="monto_inicial"
              type="number"
              step="0.01"
              required
              disabled={openPending}
              className="mt-1 w-44 border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={openPending}
            className="border-2 border-ink bg-ink px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-gold-soft hover:bg-ink/90 disabled:opacity-60"
          >
            {openPending ? "Abriendo…" : "Abrir turno"}
          </button>
        </form>
        {openState.error && <p className="mt-2 text-xs font-semibold text-red-900">{openState.error}</p>}
      </div>
    );
  }

  const efectivoTeorico = Number(turno.monto_inicial) + ingresosEfectivo - egresosEfectivo;

  return (
    <div className="border-2 border-ink bg-cream-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg italic text-gold">Turno abierto — {turno.responsable}</h3>
          <p className="text-xs text-ink/60">Desde {turno.abiertoEnFormatted}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowEgreso((v) => !v)}
            className="border-2 border-ink px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-ink hover:bg-ink/5"
          >
            Registrar egreso
          </button>
          <button
            onClick={() => setShowCierre((v) => !v)}
            className="border-2 border-ink bg-ink px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-gold-soft hover:bg-ink/90"
          >
            Cerrar turno
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="border border-ink/30 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Apertura</dt>
          <dd className="font-mono font-bold text-ink">Bs {Number(turno.monto_inicial).toFixed(2)}</dd>
        </div>
        <div className="border border-ink/30 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Ventas totales</dt>
          <dd className="font-mono font-bold text-ink">Bs {ventasTotales.toFixed(2)}</dd>
        </div>
        <div className="border border-ink/30 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Egresos</dt>
          <dd className="font-mono font-bold text-ink">Bs {egresosEfectivo.toFixed(2)}</dd>
        </div>
        <div className="border-2 border-gold bg-gold/10 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Efectivo teórico</dt>
          <dd className="font-mono font-bold text-ink">Bs {efectivoTeorico.toFixed(2)}</dd>
        </div>
      </dl>

      {showEgreso && (
        <form action={egresoAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink/20 pt-4">
          <input type="hidden" name="turno_id" value={turno.id} />
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Motivo</label>
            <input
              name="motivo"
              required
              disabled={egresoPending}
              placeholder="Ej: pago servicio de limpieza"
              className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Monto (Bs)</label>
            <input
              name="monto"
              type="number"
              step="0.01"
              required
              disabled={egresoPending}
              className="mt-1 w-32 border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={egresoPending}
            className="border-2 border-ink bg-ink px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-gold-soft hover:bg-ink/90 disabled:opacity-60"
          >
            Guardar
          </button>
          {egresoState.error && <p className="w-full text-xs font-semibold text-red-900">{egresoState.error}</p>}
        </form>
      )}

      {showCierre && (
        <form action={closeAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink/20 pt-4">
          <input type="hidden" name="turno_id" value={turno.id} />
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
              Efectivo contado en caja (Bs)
            </label>
            <input
              name="monto_final_declarado"
              type="number"
              step="0.01"
              required
              disabled={closePending}
              placeholder={efectivoTeorico.toFixed(2)}
              className="mt-1 w-44 border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={closePending}
            className="border-2 border-ink bg-ink px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-gold-soft hover:bg-ink/90 disabled:opacity-60"
          >
            {closePending ? "Cerrando…" : "Confirmar cierre"}
          </button>
          {closeState.error && <p className="w-full text-xs font-semibold text-red-900">{closeState.error}</p>}
        </form>
      )}
    </div>
  );
}
