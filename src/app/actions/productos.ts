"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth-guard";

export type ProductoState = { error?: string };

export async function crearProducto(_prev: ProductoState, formData: FormData): Promise<ProductoState> {
  await requireAdmin();

  const nombre = String(formData.get("nombre") || "").trim();
  const categoria = String(formData.get("categoria") || "").trim();
  const precio = Number(formData.get("precio_venta"));

  if (!nombre || !categoria || Number.isNaN(precio)) {
    return { error: "Completa nombre, categoría y precio." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("productos").insert({
    nombre,
    categoria,
    precio_venta: precio,
    es_inventariable: false,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/productos");
  return {};
}

export async function actualizarProducto(_prev: ProductoState, formData: FormData): Promise<ProductoState> {
  await requireAdmin();

  const id = Number(formData.get("id"));
  const nombre = String(formData.get("nombre") || "").trim();
  const categoria = String(formData.get("categoria") || "").trim();
  const precio = Number(formData.get("precio_venta"));

  if (!id || !nombre || !categoria || Number.isNaN(precio)) {
    return { error: "Datos inválidos." };
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("productos")
    .update({ nombre, categoria, precio_venta: precio })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/productos");
  return {};
}

export async function eliminarProducto(id: number) {
  await requireAdmin();
  const supabase = createServerSupabaseClient();
  await supabase.from("productos").delete().eq("id", id);
  revalidatePath("/dashboard/productos");
}
