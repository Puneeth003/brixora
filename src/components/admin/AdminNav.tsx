"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_ICONS } from "./NavIcons";
import { locate, navGroups, type Counts, type NavGroup } from "./nav-sections";

/** The short sidebar: one item per group; the group's pages are tabs in the content area. */
function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = locate(groups, pathname).group;
  return (
    <nav className="space-y-0.5">
      {groups.map((g) => (
        <Link key={g.label} href={g.href} onClick={onNavigate} className="admin-nav-item" aria-current={current === g ? "page" : undefined}>
          {NAV_ICONS[g.icon]}
          <span className="truncate">{g.label}</span>
          {g.count ? (
            <span className="admin-nav-count" data-tone={g.tone}>
              {g.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

function Brand({ role, brandName }: { role: "admin" | "agent"; brandName: string }) {
  return (
    <Link href="/admin" className="flex items-center gap-3 px-2">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-lg font-extrabold text-[var(--brand)]">
        {brandName.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-extrabold tracking-tight">{brandName}</span>
        <span className="block text-xs font-semibold text-white/50">{role === "admin" ? "Admin" : "Agent"} workspace</span>
      </span>
    </Link>
  );
}

/** Desktop: sidebar on the dark frame. Phones: a drawer opened from the top bar. */
export function AdminSidebar({
  role,
  brandName,
  counts,
  footer,
}: {
  role: "admin" | "agent";
  brandName: string;
  counts: Counts;
  footer: React.ReactNode;
}) {
  const groups = navGroups(role, counts);
  // The drawer closes itself on navigation (NavList onNavigate).
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col text-white md:flex">
        <div className="px-4 pt-6 pb-5">
          <Brand role={role} brandName={brandName} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <NavList groups={groups} />
        </div>
        <div className="px-3 pt-2 pb-4">{footer}</div>
      </aside>

      <div className="fixed top-3 left-3 z-30 md:hidden">
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
            <div className="px-4 pt-6 pb-5">
              <Brand role={role} brandName={brandName} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <NavList groups={groups} onNavigate={() => setOpen(false)} />
            </div>
            <div className="px-3 pt-2 pb-4">{footer}</div>
          </aside>
        </div>
      )}
    </>
  );
}

/** User card at the foot of the sidebar: avatar, name, status; opens a small menu upwards. */
export function UserCard({ name, email, role, signOut }: { name: string; email: string; role: string; signOut: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const initials = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute right-0 bottom-[calc(100%+8px)] left-0 z-50 rounded-2xl bg-white p-1.5 text-[var(--s-text)] shadow-[0_0_0_1px_var(--s-border),var(--s-shadow-lg)]">
          <p className="truncate px-3 pt-2 pb-1 text-xs text-zinc-500">{email}</p>
          <Link href="/admin/settings" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-[var(--s-hover)]">
            Profile & settings
          </Link>
          <Link href="/" className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-[var(--s-hover)]">
            View website
          </Link>
          {signOut}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/15 px-3 py-2.5 text-left text-white transition hover:bg-white/5"
      >
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-extrabold text-[#1c1a14]">
          {initials}
          <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[var(--sidebar-bg)] bg-emerald-400" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{name}</span>
          <span className="block text-xs text-white/55 capitalize">{role} · Active</span>
        </span>
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-white/50" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
        </svg>
      </button>
    </div>
  );
}
