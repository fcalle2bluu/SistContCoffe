import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="font-serif text-[11px] font-semibold uppercase tracking-[0.35em] text-ink/60">
        Café Yanaloma
      </p>
      <h1 className="font-serif text-2xl italic text-gold">
        Bienvenido, {session?.nombre}
      </h1>
      <p className="text-xs uppercase tracking-[0.2em] text-ink/60">Rol: {session?.role}</p>
      <p className="max-w-sm text-sm text-ink/70">
        El panel de gestión todavía no está construido — esta es la pantalla siguiente al login.
      </p>
    </div>
  );
}
