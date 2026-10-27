"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TagIcon } from "@/components/icons";

export const NAV_LINKS: { href: string; match: string; label: string; highlight?: boolean }[] = [
  { href: "/properties?listing=sale", match: "/properties", label: "Buy" },
  { href: "/post", match: "/post", label: "Sell", highlight: true },
  { href: "/manage", match: "/manage", label: "My Listings" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {NAV_LINKS.map((l) => {
        const active = pathname.startsWith(l.match);
        if (l.highlight) {
          // Owner listings are the core business: Sell is a gold pill, solid when on /post.
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`mx-1 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors lg:text-base ${
                active
                  ? "bg-gradient-to-b from-gold-400 to-gold-600 text-white shadow-md shadow-gold-600/30"
                  : "border border-gold-400 bg-gold-300/15 text-gold-600 hover:bg-gold-300/30"
              }`}
            >
              <TagIcon />
              {l.label}
            </Link>
          );
        }
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative px-4 py-2 text-sm font-medium transition-colors lg:text-base ${
              active ? "text-brand-700" : l.highlight ? "text-gold-600 hover:text-gold-500" : "text-zinc-700 hover:text-brand-700"
            }`}
          >
            {l.label}
            {active && <span className="absolute inset-x-4 -bottom-[13px] h-0.5 lg:-bottom-[22px] lg:h-[3px] rounded-full bg-gold-500" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileMenu({ contactHref }: { contactHref: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Close the menu after navigating.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-lg text-zinc-700 hover:bg-zinc-100"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-16 border-b lg:top-[4.75rem] border-zinc-200 bg-white shadow-lg">
          <nav className="container-page flex flex-col py-3">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 rounded-lg px-3 py-3 text-base font-medium ${
                  l.highlight
                    ? "bg-gold-300/20 font-semibold text-gold-600"
                    : pathname.startsWith(l.match)
                      ? "bg-brand-50 text-brand-700"
                      : "text-zinc-800 hover:bg-zinc-50"
                }`}
              >
                {l.highlight && <TagIcon />}
                {l.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-3">
              <Link href="/account" className="btn-secondary py-3">
                My account
              </Link>
              <a href={contactHref} target={contactHref.startsWith("http") ? "_blank" : undefined} rel="noopener" className="btn-primary py-3">
                Contact Now
              </a>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
