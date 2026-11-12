"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { UserIcon } from "@/components/icons";
import { memberSignOut } from "@/app/(site)/account/actions";

export type HeaderUser = { name: string | null; phone: string; unread: number };

export const ACCOUNT_LINKS = [
  { href: "/account", label: "My account" },
  { href: "/account/enquiries", label: "My enquiries" },
  { href: "/manage", label: "My listings" },
  { href: "/account/saved", label: "Saved properties" },
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

/** Shown while the session is being read. Sized like the "Sign in" link so the nav doesn't jump. */
export function ProfileFallback() {
  return <span aria-hidden className="hidden h-9 w-24 animate-pulse rounded-lg bg-zinc-100 sm:block lg:h-10 lg:w-28" />;
}

/** Header profile: a "Sign in" link when signed out, an avatar with a dropdown when signed in. */
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

  if (!user) {
    return (
      <Link href="/login" className="btn-ghost hidden font-semibold sm:inline-flex lg:text-base">
        <UserIcon />
        Sign in
      </Link>
    );
  }

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

  const mono = initials(user.name);
  const firstName = user.name?.trim().split(/\s+/)[0] ?? null;
  const itemClass = "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm focus-visible:bg-zinc-100 focus-visible:outline-none";

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
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
        className={`flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none lg:pr-3 ${open ? "bg-zinc-100" : ""}`}
      >
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-b from-brand-500 to-brand-700 text-sm font-semibold text-white shadow-sm">
          {mono ?? <UserIcon className="size-5" />}
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-red-500" aria-hidden />}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-semibold text-zinc-800 lg:block lg:text-base">{firstName ?? "My account"}</span>
        <svg
          viewBox="0 0 20 20"
          className={`hidden size-4 text-zinc-400 transition-transform lg:block ${open ? "rotate-180" : ""}`}
          fill="currentColor"
          aria-hidden
        >
          <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>

      {open && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label="Profile"
          className="absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl shadow-black/15 ring-1 ring-black/5 animate-[dropdown-in_120ms_ease-out]"
        >
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-zinc-900">{user.name ?? "Welcome"}</p>
            <p className="truncate text-xs text-zinc-500">{user.phone}</p>
          </div>
          <div className="p-1.5">
            {ACCOUNT_LINKS.map((m) => {
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
          <form action={memberSignOut} className="border-t border-zinc-100 p-1.5">
            <button type="submit" role="menuitem" className={`${itemClass} text-zinc-700 hover:bg-zinc-50`}>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
