"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth-guard";

export type InsumoState = { error?: string };

export async function crearCompraInsumo(_prev: InsumoState, formData: FormData): Promise<InsumoState> {
  const session = await requireSession();

  const fecha = String(formData.get("fecha") || "");
  const detalle = String(formData.get("detalle") || "").trim();
  const cantidad = Number(formData.get("cantidad"));
  const medida = String(formData.get("medida") || "").trim() || null;
  const respaldo = String(formData.get("respaldo") || "").trim() || null;
  const precio_unitario = Number(formData.get("precio_unitario"));
  const solicitante = String(formData.get("solicitante") || "").trim() || null;

  if (!fecha || !detalle || Number.isNaN(cantidad) || Number.isNaN(precio_unitario)) {
    return { error: "Completa fecha, detalle, cantidad y precio unitario." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("compras_insumos").insert({
    fecha,
    detalle,
    cantidad,
    medida,
    respaldo,
    precio_unitario,
    solicitante,
    responsable: session.nombre,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/insumos");
  return {};
}

export async function eliminarCompraInsumo(id: number) {
  await requireSession();
  const supabase = createServerSupabaseClient();
  await supabase.from("compras_insumos").delete().eq("id", id);
  revalidatePath("/dashboard/insumos");
}
