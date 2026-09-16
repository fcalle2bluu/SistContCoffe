import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TurnoPanel } from "@/components/turno-panel";
import { NuevaOrdenForm } from "@/components/nueva-orden-form";
import { OrdenesPendientes } from "@/components/ordenes-pendientes";
import { formatHora, formatFechaHora } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGOS_EFECTIVO = ["EFECTIVO", "EFEC/FAC"];

export default async function VentasPage() {
  const supabase = createServerSupabaseClient();

  const [{ data: turno }, { data: productos }] = await Promise.all([
    supabase.from("turnos").select("id, responsable, monto_inicial, abierto_en").eq("estado", "abierto").maybeSingle(),
    supabase.from("productos").select("id, nombre, categoria, precio_venta").order("categoria").order("nombre"),
  ]);

  let ordenesAbiertas: any[] = [];
  let ordenesCobradas: any[] = [];
  let egresosEfectivo = 0;

  if (turno) {
    const [{ data: abiertas }, { data: cobradas }, { data: movimientos }] = await Promise.all([
      supabase
        .from("ordenes")
        .select("id, mesa, total, responsable, creado_en")
        .eq("turno_id", turno.id)
        .eq("estado", "abierta")
        .order("creado_en", { ascending: false }),
      supabase
        .from("ordenes")
        .select("id, mesa, total, tipo_pago, responsable, cobrado_en")
        .eq("turno_id", turno.id)
        .eq("estado", "cobrada")
        .order("cobrado_en", { ascending: false }),
      supabase.from("movimientos_caja").select("monto").eq("turno_id", turno.id).eq("tipo", "egreso"),
    ]);
    ordenesAbiertas = abiertas ?? [];
    ordenesCobradas = cobradas ?? [];
    egresosEfectivo = (movimientos ?? []).reduce((acc, m) => acc + Number(m.monto), 0);
  }

  const ingresosEfectivo = ordenesCobradas
    .filter((o) => PAGOS_EFECTIVO.includes(o.tipo_pago))
    .reduce((acc, o) => acc + Number(o.total), 0);
  const ventasTotales = ordenesCobradas.reduce((acc, o) => acc + Number(o.total), 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl italic text-gold">Ventas / Caja</h2>
        <p className="text-sm text-ink/60">
          Reemplaza el cuaderno mensual del Excel: comandas, cobro y cierre de caja.
        </p>
      </div>

      <TurnoPanel
        turno={turno ? { ...turno, abiertoEnFormatted: formatFechaHora(turno.abierto_en) } : null}
        ingresosEfectivo={ingresosEfectivo}
        egresosEfectivo={egresosEfectivo}
        ventasTotales={ventasTotales}
      />

      {turno && (
        <>
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/60">Nuevo pedido</h3>
            <NuevaOrdenForm productos={productos ?? []} turnoId={turno.id} />
          </div>

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/60">
              Cuentas pendientes ({ordenesAbiertas.length})
            </h3>
            <OrdenesPendientes
              ordenes={ordenesAbiertas.map((o) => ({ ...o, horaFormatted: formatHora(o.creado_en) }))}
            />
          </div>

          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-ink/60">
              Ventas cobradas del turno ({ordenesCobradas.length})
            </h3>
            {ordenesCobradas.length === 0 ? (
              <p className="text-sm text-ink/60">Todavía no hay ventas cobradas en este turno.</p>
            ) : (
              <div className="overflow-x-auto border-2 border-ink">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b-2 border-ink bg-ink text-gold-soft">
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Mesa</th>
                      <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.15em]">Total</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Pago</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Responsable</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.15em]">Hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesCobradas.map((o) => (
                      <tr key={o.id} className="border-b border-ink/20 hover:bg-gold/5">
                        <td className="px-3 py-2 text-sm text-ink">{o.mesa}</td>
                        <td className="px-3 py-2 text-right font-mono text-sm text-ink">
                          Bs {Number(o.total).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-xs uppercase text-ink/70">{o.tipo_pago}</td>
                        <td className="px-3 py-2 text-xs text-ink/60">{o.responsable}</td>
                        <td className="px-3 py-2 text-xs text-ink/60">
                          {o.cobrado_en ? formatHora(o.cobrado_en) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
