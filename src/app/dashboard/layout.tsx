import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { logout } from "@/app/actions/auth";
import { DashboardNav } from "@/components/dashboard-nav";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role === "cajero") redirect("/pos");

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b-2 border-ink bg-cream-soft px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-serif text-[10px] font-semibold uppercase tracking-[0.35em] text-ink/60">
              The Roasting Lab
            </p>
            <h1 className="font-serif text-xl italic text-gold">Café Yanaloma</h1>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="uppercase tracking-[0.15em] text-ink/70">
              {session.nombre} · {session.role}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="border-2 border-ink bg-ink px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-soft hover:bg-ink/90"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <DashboardNav />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
