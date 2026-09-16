"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { crearOrden, type VentaState } from "@/app/actions/ventas";

const initial: VentaState = {};

type Producto = { id: number; nombre: string; categoria: string; precio_venta: number };
type CartItem = { producto_id: number; producto_nombre: string; cantidad: number; precio_unitario: number };

const TIPOS_PAGO = ["EFECTIVO", "QR", "POS", "EFEC/FAC", "QR/FAC"];

export function NuevaOrdenForm({ productos, turnoId }: { productos: Producto[]; turnoId: number }) {
  const [state, formAction, pending] = useActionState(crearOrden, initial);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [cantidad, setCantidad] = useState(1);
  const [mesa, setMesa] = useState("");
  const [accion, setAccion] = useState<"cobrar" | "pendiente">("cobrar");
  const formRef = useRef<HTMLFormElement>(null);

  const porCategoria = useMemo(() => {
    const map = new Map<string, Producto[]>();
    for (const p of productos) {
      if (!map.has(p.categoria)) map.set(p.categoria, []);
      map.get(p.categoria)!.push(p);
    }
    return [...map.entries()];
  }, [productos]);

  const total = cart.reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0);

  function agregarItem() {
    const producto = productos.find((p) => p.id === Number(selectedProductId));
    if (!producto || cantidad <= 0) return;
    setCart((prev) => {
      const existing = prev.find((it) => it.producto_id === producto.id);
      if (existing) {
        return prev.map((it) =>
          it.producto_id === producto.id ? { ...it, cantidad: it.cantidad + cantidad } : it
        );
      }
      return [
        ...prev,
        {
          producto_id: producto.id,
          producto_nombre: producto.nombre,
          cantidad,
          precio_unitario: Number(producto.precio_venta),
        },
      ];
    });
    setCantidad(1);
  }

  function quitarItem(producto_id: number) {
    setCart((prev) => prev.filter((it) => it.producto_id !== producto_id));
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        if (!state.error) {
          setCart([]);
          setMesa("");
          formRef.current?.reset();
        }
      }}
      className="space-y-4 border-2 border-ink bg-cream-soft p-5"
    >
      <input type="hidden" name="turno_id" value={turnoId} />
      <input type="hidden" name="items" value={JSON.stringify(cart)} />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
            Mesa / referencia
          </label>
          <input
            name="mesa"
            value={mesa}
            onChange={(e) => setMesa(e.target.value)}
            required
            placeholder="Ej: Mesa 3, Llevar, 7 CH…"
            className="mt-1 w-44 border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold"
          />
        </div>

        <div className="flex-1 min-w-[220px]">
          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Producto</label>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="mt-1 w-full border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold"
          >
            <option value="">— Selecciona —</option>
            {porCategoria.map(([categoria, items]) => (
              <optgroup key={categoria} label={categoria}>
                {items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — Bs {Number(p.precio_venta).toFixed(2)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">Cant.</label>
          <input
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            className="mt-1 w-20 border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold"
          />
        </div>

        <button
          type="button"
          onClick={agregarItem}
          disabled={!selectedProductId}
          className="border-2 border-ink px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-ink hover:bg-ink/5 disabled:opacity-40"
        >
          + Agregar
        </button>
      </div>

      {cart.length > 0 && (
        <div className="border border-ink/30">
          <table className="w-full">
            <tbody>
              {cart.map((it) => (
                <tr key={it.producto_id} className="border-b border-ink/10 last:border-0">
                  <td className="px-3 py-1.5 text-sm text-ink">{it.producto_nombre}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-ink/70">
                    {it.cantidad} × {it.precio_unitario.toFixed(2)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-sm font-bold text-ink">
                    {(it.cantidad * it.precio_unitario).toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => quitarItem(it.producto_id)}
                      className="text-[10px] font-bold uppercase text-red-900/70 hover:text-red-900"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-ink/20 pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
              Método de pago
            </label>
            <select
              name="tipo_pago"
              defaultValue=""
              className="mt-1 w-36 border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold"
            >
              <option value="">—</option>
              {TIPOS_PAGO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
              Monto pagado (Bs)
            </label>
            <input
              name="monto_pagado"
              type="number"
              step="0.01"
              placeholder={total > 0 ? total.toFixed(2) : "0.00"}
              className="mt-1 w-28 border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink">
              Observación
            </label>
            <input
              name="observacion"
              className="mt-1 w-40 border-2 border-ink bg-cream px-2.5 py-2 text-sm text-ink outline-none focus:border-gold"
            />
          </div>
        </div>

        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-ink/50">Total</p>
          <p className="font-mono text-2xl font-black text-gold">Bs {total.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="accion"
          value="cobrar"
          disabled={pending || cart.length === 0}
          onClick={() => setAccion("cobrar")}
          className="border-2 border-ink bg-ink px-6 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-gold-soft hover:bg-ink/90 disabled:opacity-40"
        >
          {pending && accion === "cobrar" ? "Cobrando…" : "Cobrar"}
        </button>
        <button
          type="submit"
          name="accion"
          value="pendiente"
          disabled={pending || cart.length === 0}
          onClick={() => setAccion("pendiente")}
          className="border-2 border-ink px-6 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-ink hover:bg-ink/5 disabled:opacity-40"
        >
          {pending && accion === "pendiente" ? "Guardando…" : "Guardar cuenta pendiente"}
        </button>
      </div>

      {state.error && (
        <p className="border-2 border-red-900/70 bg-red-900/5 px-3 py-2 text-xs font-semibold text-red-900">
          {state.error}
        </p>
      )}
    </form>
  );
}
