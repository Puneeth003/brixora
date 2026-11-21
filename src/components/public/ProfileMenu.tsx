"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { UserIcon } from "@/components/icons";
import { memberSignOut } from "@/app/(site)/account/actions";

export type HeaderUser = { name: string | null; phone: string; unread: number };

export const ACCOUNT_LINKS = [
  // The account page, labelled "My listings" at the owner's request.
  { href: "/account", label: "My listings" },
  { href: "/account/enquiries", label: "My enquiries" },
  { href: "/shortlist", label: "Shortlist" },
];

/** The profile menu when signed out. */
const GUEST_LINKS = [
  { href: "/manage", label: "My listings" },
  { href: "/shortlist", label: "Shortlist" },
];

/** "/account" only matches itself; the others match their section. */
export function isAccountLinkActive(href: string, pathname: string) {
  return pathname === href || (href !== "/account" && pathname.startsWith(href));
}

/** Fired in the browser once the member's replies have been marked read (see MarkRepliesRead). */
export const REPLIES_READ_EVENT = "brixora:replies-read";

/**
 * Unread count for the header. The header lives in the layout, which isn't re-rendered
 * on navigation, so the count from the server is dropped to zero when the enquiries page
 * reports the replies as read. A new count from the server takes over again.
 */
export function useUnread(count: number) {
  const [cleared, setCleared] = useState(false);
  const [lastCount, setLastCount] = useState(count);
  if (count !== lastCount) {
    setLastCount(count);
    setCleared(false);
  }
  useEffect(() => {
    const onRead = () => setCleared(true);
    window.addEventListener(REPLIES_READ_EVENT, onRead);
    return () => window.removeEventListener(REPLIES_READ_EVENT, onRead);
  }, []);
  return cleared ? 0 : count;
}

function initials(name: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Shown while the session is being read. Sized like the profile icon so the nav doesn't jump. */
export function ProfileFallback() {
  return <span aria-hidden className="hidden h-11 w-11 animate-pulse rounded-full bg-zinc-100 sm:block lg:w-36" />;
}

/** Header profile: an "Owner login" icon when signed out, an avatar with a dropdown when signed in. */
export function ProfileMenu({ user }: { user: HeaderUser | null }) {
  const id = useId();
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusFirst = useRef(false);
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const unread = useUnread(user?.unread ?? 0);

  // Close after navigating.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  const items = () => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    // Opened from the keyboard: start on the first item.
    if (focusFirst.current) items()[0]?.focus();
    focusFirst.current = false;

    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" && e.target === buttonRef.current) {
        e.preventDefault();
        focusFirst.current = true;
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? list.length - 1
            : e.key === "ArrowDown"
              ? (at + 1) % list.length
              : (at - 1 + list.length) % list.length;
      list[next]?.focus();
    }
  }

  const mono = user ? initials(user.name) : null;
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? null;
  const itemClass = "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm focus-visible:bg-zinc-100 focus-visible:outline-none";
  // Signed out: the same menu with the owner pages (they lead to the WhatsApp login).
  const links = user ? ACCOUNT_LINKS : GUEST_LINKS;

  return (
    // Signed out on phones, the menu button covers this (see MobileMenu).
    <div ref={rootRef} className={`relative ${user ? "" : "hidden sm:block"}`} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          // detail is 0 when the click comes from Enter / Space.
          focusFirst.current = !open && e.detail === 0;
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={`${open ? "Close" : "Open"} profile menu${unread > 0 ? ` (${unread} unread ${unread === 1 ? "reply" : "replies"})` : ""}`}
        title={user ? (firstName ?? "My account") : "My listings & owner login"}
        className={`flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none lg:pr-3 ${open ? "bg-zinc-100" : ""}`}
      >
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-brand-500 to-brand-700 text-sm font-semibold text-white shadow-sm">
          {mono ?? <UserIcon className="size-5" />}
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-red-500" aria-hidden />}
        </span>
        <span className="hidden text-sm font-semibold whitespace-nowrap text-zinc-800 lg:block lg:text-base">My listings</span>
      </button>

      {open && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label="Profile"
          className="absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl shadow-black/15 ring-1 ring-black/5 animate-[dropdown-in_120ms_ease-out]"
        >
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-zinc-900">{user ? (user.name ?? "Welcome") : "Property owners"}</p>
            <p className="truncate text-xs text-zinc-500">{user ? user.phone : "Log in with your WhatsApp number"}</p>
          </div>
          <div className="p-1.5">
            {links.map((m) => {
              const active = isAccountLinkActive(m.href, pathname);
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  role="menuitem"
                  aria-current={active ? "page" : undefined}
                  // Navigating to the page we're already on doesn't change the path, so close here too.
                  onClick={() => setOpen(false)}
                  className={`${itemClass} ${active ? "bg-brand-50 font-medium text-brand-700" : "text-zinc-700 hover:bg-zinc-50"}`}
                >
                  {m.label}
                  {m.href === "/account/enquiries" && unread > 0 && <span className="badge bg-red-100 text-red-700">{unread}</span>}
                </Link>
              );
            })}
          </div>
          {user ? (
            <form action={memberSignOut} className="border-t border-zinc-100 p-1.5">
              <button type="submit" role="menuitem" className={`${itemClass} text-zinc-700 hover:bg-zinc-50`}>
                Sign out
              </button>
            </form>
          ) : (
            <div className="border-t border-zinc-100 p-1.5">
              <Link href="/login?next=/manage" role="menuitem" onClick={() => setOpen(false)} className={`${itemClass} font-semibold text-brand-700 hover:bg-brand-50`}>
                Owner login
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
