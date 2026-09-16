"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { setSession, clearSession } from "@/lib/session";

export type LoginState = {
  error?: string;
};

function roleHome(role: string): string {
  if (role === "cajero") return "/pos";
  if (role === "admin") return "/dashboard";
  return "/dashboard";
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();

  if (!username || !password) {
    return { error: "Ingresa usuario y contraseña." };
  }

  const supabase = createServerSupabaseClient();
  const { data: user, error } = await supabase
    .from("usuarios")
    .select("id, username, nombre, role, password")
    .eq("username", username)
    .maybeSingle();

  if (error || !user || user.password !== password) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  await setSession({
    id: user.id,
    username: user.username,
    nombre: user.nombre,
    role: user.role,
  });

  redirect(roleHome(user.role));
}

export async function logout() {
  await clearSession();
  redirect("/");
}
