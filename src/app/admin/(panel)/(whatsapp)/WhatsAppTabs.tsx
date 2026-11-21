"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/broadcasts", label: "Broadcasts" },
  { href: "/admin/templates", label: "Templates" },
  { href: "/admin/messages", label: "Message log" },
  { href: "/admin/broadcasts/opt-outs", label: "Opt-outs" },
];

/** Sub-navigation for the WhatsApp screens (the sidebar has a single WhatsApp item). */
export function WhatsAppTabs() {
  const pathname = usePathname();
  // The longest matching prefix wins, so /admin/broadcasts/opt-outs isn't also "Broadcasts".
  const active = TABS.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="WhatsApp" className="mb-6 max-w-full overflow-x-auto">
      <div className="inline-flex gap-0.5 rounded-2xl bg-[var(--s-seg)] p-1">
        {TABS.map((t) => {
          const on = active === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                on ? "bg-white text-[var(--s-text)] shadow-[0_1px_3px_rgba(10,16,12,0.1)]" : "text-[var(--s-muted)] hover:text-[var(--s-text)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
