"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locate, navGroups, type Counts } from "./nav-sections";

/** The current sidebar group's pages, as tabs at the top of the content area. */
export function SectionTabs({ role, counts }: { role: "admin" | "agent"; counts: Counts }) {
  const pathname = usePathname();
  const { group, tab } = locate(navGroups(role, counts), pathname);
  if (!group || group.tabs.length < 2) return null;
  return (
    <nav aria-label={group.label} className="mb-6 max-w-full overflow-x-auto">
      <div className="inline-flex gap-0.5 rounded-2xl bg-[var(--s-seg)] p-1">
        {group.tabs.map((t) => {
          const on = tab?.href === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors ${
                on ? "bg-white text-[var(--s-text)] shadow-[0_1px_3px_rgba(10,16,12,0.1)]" : "text-[var(--s-muted)] hover:text-[var(--s-text)]"
              }`}
            >
              {t.label}
              {t.count ? (
                <span
                  className={`rounded-md px-1.5 py-px text-[11px] font-extrabold tabular-nums ${
                    t.tone === "bad" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {t.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
