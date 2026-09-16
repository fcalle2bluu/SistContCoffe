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
    <div className="flex min-h-screen flex-col bg-cream md:flex-row">
      <aside className="flex flex-col border-b-2 border-ink bg-cream-soft md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r-2">
        <div className="px-5 py-5">
          <p className="font-serif text-[10px] font-semibold uppercase tracking-[0.35em] text-ink/60">
            The Roasting Lab
          </p>
          <h1 className="font-serif text-xl italic text-gold">Café Yanaloma</h1>
        </div>

        <DashboardNav />

        <div className="mt-auto flex flex-col gap-2 border-t-2 border-ink/20 px-5 py-4 text-xs md:border-t-2">
          <span className="uppercase tracking-[0.15em] text-ink/70">
            {session.nombre} · {session.role}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="w-full border-2 border-ink bg-ink px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-soft hover:bg-ink/90"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
