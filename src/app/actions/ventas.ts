"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth-guard";

export type VentaState = { error?: string };

export async function abrirTurno(_prev: VentaState, formData: FormData): Promise<VentaState> {
  const session = await requireSession();
  const monto_inicial = Number(formData.get("monto_inicial"));
  if (Number.isNaN(monto_inicial) || monto_inicial < 0) {
    return { error: "Ingresa un monto inicial válido." };
  }

  const supabase = createServerSupabaseClient();

  const { data: abierto } = await supabase.from("turnos").select("id").eq("estado", "abierto").maybeSingle();
  if (abierto) return { error: "Ya hay un turno abierto." };

  const { error } = await supabase.from("turnos").insert({
    responsable: session.nombre,
    monto_inicial,
    estado: "abierto",
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/ventas");
  return {};
}

export async function cerrarTurno(_prev: VentaState, formData: FormData): Promise<VentaState> {
  await requireSession();
  const turno_id = Number(formData.get("turno_id"));
  const monto_final_declarado = Number(formData.get("monto_final_declarado"));
  if (!turno_id || Number.isNaN(monto_final_declarado)) {
    return { error: "Ingresa el monto final contado en caja." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("turnos")
    .update({ estado: "cerrado", monto_final_declarado, cerrado_en: new Date().toISOString() })
    .eq("id", turno_id)
    .eq("estado", "abierto");
  if (error) return { error: error.message };

  revalidatePath("/dashboard/ventas");
  return {};
}

export async function registrarMovimientoCaja(_prev: VentaState, formData: FormData): Promise<VentaState> {
  const session = await requireSession();
  const turno_id = Number(formData.get("turno_id"));
  const monto = Number(formData.get("monto"));
  const motivo = String(formData.get("motivo") || "").trim();

  if (!turno_id || Number.isNaN(monto) || monto <= 0 || !motivo) {
    return { error: "Completa motivo y monto (mayor a 0)." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("movimientos_caja").insert({
    turno_id,
    tipo: "egreso",
    monto,
    motivo,
    responsable: session.nombre,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/ventas");
  return {};
}

type CartItem = { producto_id: number | null; producto_nombre: string; cantidad: number; precio_unitario: number };

export async function crearOrden(_prev: VentaState, formData: FormData): Promise<VentaState> {
  const session = await requireSession();

  const turno_id = Number(formData.get("turno_id"));
  const mesa = String(formData.get("mesa") || "").trim();
  const itemsRaw = String(formData.get("items") || "[]");
  const accion = String(formData.get("accion") || "pendiente"); // 'cobrar' | 'pendiente'
  const tipo_pago = String(formData.get("tipo_pago") || "").trim() || null;
  const monto_pagadoRaw = formData.get("monto_pagado");
  const monto_pagado = monto_pagadoRaw ? Number(monto_pagadoRaw) : null;
  const observacion = String(formData.get("observacion") || "").trim() || null;

  if (!turno_id) return { error: "No hay un turno abierto." };
  if (!mesa) return { error: "Indica la mesa o referencia del pedido." };

  let items: CartItem[];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { error: "Carrito inválido." };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Agrega al menos un producto." };
  }
  if (accion === "cobrar" && !tipo_pago) {
    return { error: "Elige el método de pago para cobrar." };
  }

  const total = items.reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0);

  const supabase = createServerSupabaseClient();
  const { data: orden, error: ordenError } = await supabase
    .from("ordenes")
    .insert({
      turno_id,
      mesa,
      estado: accion === "cobrar" ? "cobrada" : "abierta",
      tipo_pago: accion === "cobrar" ? tipo_pago : null,
      monto_pagado: accion === "cobrar" ? monto_pagado : null,
      responsable: session.nombre,
      observacion,
      total,
      cobrado_en: accion === "cobrar" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (ordenError || !orden) return { error: ordenError?.message || "No se pudo crear el pedido." };

  const { error: itemsError } = await supabase.from("orden_items").insert(
    items.map((it) => ({
      orden_id: orden.id,
      producto_id: it.producto_id,
      producto_nombre: it.producto_nombre,
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
    }))
  );

  if (itemsError) return { error: itemsError.message };

  revalidatePath("/dashboard/ventas");
  return {};
}

export async function cobrarOrdenPendiente(formData: FormData) {
  await requireSession();
  const orden_id = Number(formData.get("orden_id"));
  const tipo_pago = String(formData.get("tipo_pago") || "").trim();
  const monto_pagadoRaw = formData.get("monto_pagado");
  const monto_pagado = monto_pagadoRaw ? Number(monto_pagadoRaw) : null;

  if (!orden_id || !tipo_pago) return;

  const supabase = createServerSupabaseClient();
  await supabase
    .from("ordenes")
    .update({ estado: "cobrada", tipo_pago, monto_pagado, cobrado_en: new Date().toISOString() })
    .eq("id", orden_id)
    .eq("estado", "abierta");

  revalidatePath("/dashboard/ventas");
}

export async function cancelarOrden(id: number) {
  await requireSession();
  const supabase = createServerSupabaseClient();
  await supabase.from("ordenes").update({ estado: "cancelada" }).eq("id", id);
  revalidatePath("/dashboard/ventas");
}
