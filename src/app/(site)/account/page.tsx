import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { unreadReplies } from "@/lib/member";
import { ManageLogin } from "@/components/public/ManageLogin";
import { AccountShell } from "@/components/account/AccountShell";
import { ProfileForm } from "@/components/account/AccountForms";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function AccountPage() {
  return (
    <div className="container-page max-w-4xl py-10">
      <Suspense fallback={<div className="card mx-auto h-64 max-w-md animate-pulse bg-zinc-50" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const member = await getOwner();
  if (!member) {
    return <ManageLogin next="/account" title="Sign in" />;
  }
  const [me, enquiries, unread, listings, live, saved] = await Promise.all([
    db.one<{ email: string | null }>("SELECT email FROM users WHERE id = ?", [member.id]),
    db.count("SELECT COUNT(*) FROM enquiries WHERE user_id = ?", [member.id]),
    unreadReplies(member.id),
    db.count("SELECT COUNT(*) FROM properties WHERE owner_id = ? AND status <> 'draft'", [member.id]),
    db.count("SELECT COUNT(*) FROM properties WHERE owner_id = ? AND status = 'approved'", [member.id]),
    db.count("SELECT COUNT(*) FROM saved_properties s JOIN public_properties p ON p.id = s.property_id WHERE s.user_id = ?", [member.id]),
  ]);

  const cards = [
    { href: "/account/enquiries", label: "My enquiries", value: enquiries, note: unread ? `${unread} new repl${unread === 1 ? "y" : "ies"}` : "Replies from our team" },
    { href: "/manage", label: "My listings", value: listings, note: listings ? `${live} live` : "Post your property for free" },
    { href: "/account/saved", label: "Saved properties", value: saved, note: "Your shortlist" },
  ];

  return (
    <AccountShell active="/account" name={member.profile.name} phone={member.phone} unread={unread}>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card block p-5 hover:border-brand-300">
            <p className="text-sm text-zinc-500">{c.label}</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{c.value}</p>
            <p className={`mt-1 text-xs ${c.note.includes("new") ? "font-medium text-red-600" : "text-zinc-500"}`}>{c.note}</p>
          </Link>
        ))}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-4 font-semibold">Your details</h2>
        <ProfileForm name={member.profile.name} email={me?.email ?? null} />
        <p className="mt-4 text-xs text-zinc-500">You sign in with your WhatsApp number; there&apos;s no password to remember.</p>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/properties" className="btn-secondary">
          Browse properties
        </Link>
        <Link href="/post" className="btn-secondary">
          Post a property
        </Link>
      </div>
    </AccountShell>
  );
}
