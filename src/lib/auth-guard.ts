import "server-only";
import { getSession, type SessionUser } from "@/lib/session";

// Los Server Actions se pueden invocar directo (no solo desde la UI protegida
// por el layout), así que cada acción sensible vuelve a verificar la sesión.
export async function requireAdmin(): Promise<SessionUser> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    throw new Error("No autorizado.");
  }
  return session;
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error("No autorizado.");
  }
  return session;
}
