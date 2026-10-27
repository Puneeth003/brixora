"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { site } from "@/lib/site";
import { NAV_ICONS } from "./NavIcons";

type Counts = { submissions: number; requests: number; failed: number; followUps: number; unread: number; visits: number };
type Item = { href: string; label: string; icon: string; count?: number; tone?: "warn" | "bad" };
type Section = { title?: string; items: Item[] };

function sectionsFor(role: "admin" | "agent", counts: Counts): Section[] {
  const crm: Item[] = [
    { href: "/admin/clients", label: "Clients", icon: "clients", count: counts.followUps, tone: "warn" },
    { href: "/admin/inbox", label: "Inbox", icon: "inbox", count: counts.unread, tone: "bad" },
    { href: "/admin/calendar", label: "Calendar", icon: "calendar" },
  ];
  const visits: Item = { href: "/admin/verifications", label: "Site visits", icon: "verify", count: counts.visits, tone: "warn" };
  if (role !== "admin") {
    return [
      { items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }, visits, ...crm] },
      { title: "Account", items: [{ href: "/admin/settings", label: "Settings", icon: "settings" }] },
    ];
  }
  return [
    { items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }] },
    {
      title: "Listings",
      items: [
        { href: "/admin/submissions", label: "Submissions", icon: "submissions", count: counts.submissions, tone: "warn" },
        visits,
        { href: "/admin/listings", label: "Listings", icon: "listings" },
        { href: "/admin/requests", label: "Change requests", icon: "requests", count: counts.requests, tone: "warn" },
        { href: "/admin/builders", label: "Builders", icon: "builders" },
      ],
    },
    { title: "CRM", items: [...crm, { href: "/admin/enquiries", label: "Enquiries", icon: "enquiries" }] },
    {
      title: "Team",
      items: [
        { href: "/admin/users", label: "Users", icon: "users" },
        { href: "/admin/workload", label: "Workload", icon: "workload" },
        { href: "/admin/activity", label: "Activity", icon: "activity" },
        { href: "/admin/reports", label: "Reports", icon: "reports" },
      ],
    },
    {
      title: "System",
      items: [
        { href: "/admin/settings", label: "Settings", icon: "settings" },
        { href: "/admin/messages", label: "WhatsApp log", icon: "messages", count: counts.failed, tone: "bad" },
      ],
    },
  ];
}

function NavList({ sections, onNavigate }: { sections: Section[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-4">
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className="px-4 pb-1 text-[11px] font-bold tracking-wider text-white/40 uppercase">{s.title}</p>}
          {s.items.map((it) => {
            const active = it.href === "/admin" ? pathname === it.href : pathname.startsWith(it.href);
            return (
              <Link key={it.href} href={it.href} onClick={onNavigate} className="admin-nav-item" aria-current={active ? "page" : undefined}>
                {NAV_ICONS[it.icon]}
                <span className="truncate">{it.label}</span>
                {it.count ? (
                  <span className="admin-nav-count" data-tone={it.tone}>
                    {it.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Brand({ role }: { role: "admin" | "agent" }) {
  return (
    <Link href="/admin" className="flex items-center gap-3 px-2">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-lg font-extrabold text-[var(--brand)]">
        {site.name.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-extrabold tracking-tight">{site.name}</span>
        <span className="block text-xs font-semibold text-white/50">{role === "admin" ? "Admin" : "Agent"} workspace</span>
      </span>
    </Link>
  );
}

/** Desktop: floating sidebar. Phones: a drawer opened from the top bar. */
export function AdminSidebar({ role, counts, footer }: { role: "admin" | "agent"; counts: Counts; footer: React.ReactNode }) {
  const sections = sectionsFor(role, counts);
  // The drawer closes itself on navigation (NavList onNavigate).
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="admin-sidebar fixed top-4 bottom-4 left-4 z-30 hidden w-[264px] flex-col md:flex">
        <div className="px-3 pt-5 pb-4">
          <Brand role={role} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <NavList sections={sections} />
        </div>
        <div className="border-t border-white/10 px-3 py-3">{footer}</div>
      </aside>

      <div className="fixed top-4 left-4 z-30 md:hidden">
        <button type="button" onClick={() => setOpen(true)} className="admin-chip w-11 justify-center p-0" aria-label="Open menu">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="admin-sidebar absolute inset-y-0 left-0 flex w-[280px] flex-col rounded-l-none">
            <div className="px-3 pt-5 pb-4">
              <Brand role={role} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <NavList sections={sections} onNavigate={() => setOpen(false)} />
            </div>
            <div className="border-t border-white/10 px-3 py-3">{footer}</div>
          </aside>
        </div>
      )}
    </>
  );
}

/** Name + avatar chip with a small menu (password, site, sign out). */
export function UserMenu({ name, email, role, signOut }: { name: string; email: string; role: string; signOut: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="admin-chip pl-1.5" aria-expanded={open}>
        <span className="flex size-8 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-extrabold text-white">{initials}</span>
        <span className="hidden max-w-40 truncate sm:block">{name}</span>
        <svg viewBox="0 0 24 24" className={`size-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-60 rounded-2xl bg-white p-1.5 shadow-[0_0_0_1px_var(--s-border),var(--s-shadow-lg)]">
          <div className="mb-1 border-b border-[var(--s-border)] px-3 pt-2.5 pb-3">
            <p className="truncate text-sm font-extrabold">{name}</p>
            <p className="truncate text-xs text-zinc-500">
              {email} · <span className="capitalize">{role}</span>
            </p>
          </div>
          <Link href="/admin/settings" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-[var(--s-hover)]">
            Profile & password
          </Link>
          <Link href="/" className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-[var(--s-hover)]">
            View website
          </Link>
          {signOut}
        </div>
      )}
    </div>
  );
}
