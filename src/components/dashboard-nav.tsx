"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/ventas", label: "Ventas / Caja" },
  { href: "/dashboard/insumos", label: "Control de Insumos" },
  { href: "/dashboard/clientes", label: "Clientes" },
  { href: "/dashboard/productos", label: "Productos" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b-2 border-ink bg-cream">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-1 overflow-x-auto px-2 sm:px-6">
        {TABS.map((tab) => {
          const isActive =
            tab.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap border-b-4 px-3 py-3 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors ${
                isActive
                  ? "border-gold text-ink"
                  : "border-transparent text-ink/60 hover:border-gold/50 hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
