import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logout } from "@/app/actions/auth";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-4 text-center">
      <p className="font-serif text-[11px] font-semibold uppercase tracking-[0.35em] text-ink/60">
        Café Yanaloma
      </p>
      <h1 className="font-serif text-2xl italic text-gold">
        Caja — {session.nombre}
      </h1>
      <p className="max-w-sm text-sm text-ink/70">
        El punto de venta todavía no está construido — esta es la pantalla siguiente al login.
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="mt-2 border-2 border-ink bg-ink px-6 py-2 text-xs font-bold uppercase tracking-[0.25em] text-gold-soft hover:bg-ink/90"
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
