import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromNow } from "@/lib/time";
import { AdminSidebar, UserMenu } from "@/components/admin/AdminNav";
import { adminSignOut } from "../actions";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex-1 animate-pulse bg-[var(--s-bg)]" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const isAdmin = staff.role === "admin";
  const mine = isAdmin ? "" : " AND assigned_to = ?";
  const [submissions, requests, failed, followUps, unread, theme, visits] = await Promise.all([
    isAdmin ? db.count("SELECT COUNT(*) FROM properties WHERE status IN ('pending', 'under_review')") : 0,
    isAdmin ? db.count("SELECT COUNT(*) FROM change_requests WHERE status = 'pending' AND submitted = 1") : 0,
    isAdmin ? db.count("SELECT COUNT(*) FROM messages WHERE status = 'failed'") : 0,
    db.count(
      `SELECT COUNT(*) FROM clients WHERE next_follow_up <= ? AND status NOT IN ('won', 'lost')${mine}`,
      [fromNow(86_400_000), ...(isAdmin ? [] : [staff.userId])],
    ),
    // Member messages on enquiries that staff haven't read yet.
    db.count(
      `SELECT COUNT(*) FROM enquiry_messages m JOIN enquiries e ON e.id = m.enquiry_id LEFT JOIN clients c ON c.id = e.client_id
        WHERE m.sender = 'member' AND m.read_at IS NULL${isAdmin ? "" : " AND c.assigned_to = ?"}`,
      isAdmin ? [] : [staff.userId],
    ),
    // Colours chosen in Settings → Organization.
    db.all<{ name: string; value: string }>("SELECT name, value FROM app_config WHERE name IN ('brand_color', 'sidebar_color')"),
    // Open site visits (an agent's own).
    db.count(`SELECT COUNT(*) FROM site_verifications WHERE status = 'scheduled'${mine}`, isAdmin ? [] : [staff.userId]),
  ]);
  const color = (name: string) => {
    const v = theme.find((t) => t.name === name)?.value;
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined;
  };
  const themeVars = { "--brand": color("brand_color"), "--sidebar-bg": color("sidebar_color") } as React.CSSProperties;

  const displayName = staff.name ?? staff.email;
  const signOut = (
    <form action={adminSignOut}>
      <button className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50">Sign out</button>
    </form>
  );

  return (
    <div className="admin-canvas flex min-h-full flex-1" style={themeVars}>
      <AdminSidebar
        role={staff.role}
        counts={{ submissions, requests, failed, followUps, unread, visits }}
        footer={
          <form action={adminSignOut}>
            <button className="admin-nav-item w-full">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
              </svg>
              Log out
            </button>
          </form>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col md:pl-[296px]">
        <header className="sticky top-0 z-20 flex items-center justify-end gap-3 bg-[var(--s-bg)] px-4 pt-4 pb-2 pl-[72px] sm:px-8 md:pl-8">
          <Link href="/admin/calendar" className="admin-chip" title="Follow-ups due in the next 24 hours">
            <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2.5M9 2h6" />
            </svg>
            <span className="hidden sm:inline">Follow-ups</span>
            {followUps > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[11px] font-extrabold text-white">{followUps}</span>
            )}
          </Link>
          <UserMenu name={displayName} email={staff.email} role={staff.role} signOut={signOut} />
        </header>
        <main className="min-w-0 flex-1 px-4 pt-2 pb-10 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
