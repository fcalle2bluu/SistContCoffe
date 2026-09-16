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
    <nav className="flex overflow-x-auto md:block md:overflow-visible">
      {TABS.map((tab) => {
        const isActive =
          tab.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`block whitespace-nowrap border-b-4 md:border-b-0 md:border-l-4 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.15em] transition-colors ${
              isActive
                ? "border-gold bg-gold/10 text-ink"
                : "border-transparent text-ink/60 hover:border-gold/50 hover:bg-gold/5 hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
