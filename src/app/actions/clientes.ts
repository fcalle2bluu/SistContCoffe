"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth-guard";

export type ClienteState = { error?: string };

export async function crearCliente(_prev: ClienteState, formData: FormData): Promise<ClienteState> {
  await requireSession();

  const nombre = String(formData.get("nombre") || "").trim();
  const ci_nit = String(formData.get("ci_nit") || "").trim() || null;
  const telefono = String(formData.get("telefono") || "").trim() || null;

  if (!nombre) return { error: "El nombre / razón social es obligatorio." };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("clientes").insert({ nombre, ci_nit, telefono });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/clientes");
  return {};
}

export async function eliminarCliente(id: number) {
  await requireSession();
  const supabase = createServerSupabaseClient();
  await supabase.from("clientes").delete().eq("id", id);
  revalidatePath("/dashboard/clientes");
}
