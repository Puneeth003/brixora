import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { unreadReplies } from "@/lib/member";
import { formatDateTime, formatPrice } from "@/lib/format";
import { site } from "@/lib/site";
import { ManageLogin } from "@/components/public/ManageLogin";
import { AccountShell } from "@/components/account/AccountShell";
import { MarkRepliesRead, MessageForm } from "@/components/account/AccountForms";
import type { EnquiryMessage, ListingType } from "@/lib/types";

export const metadata: Metadata = { title: "My enquiries", robots: { index: false } };

export default function EnquiriesPage() {
  return (
    <div className="container-page max-w-4xl py-10">
      <Suspense fallback={<div className="card mx-auto h-64 max-w-md animate-pulse bg-zinc-50" />}>
        <Content />
      </Suspense>
    </div>
  );
}

type Row = {
  id: string;
  message: string | null;
  created_at: string;
  reference_no: string | null;
  title: string | null;
  price: number | null;
  listing_type: ListingType | null;
  live: boolean;
};

async function Content() {
  const member = await getOwner();
  if (!member) return <ManageLogin next="/account/enquiries" title="Sign in" />;

  const [enquiries, unread] = await Promise.all([
    db.all<Row>(
      `SELECT e.id, e.message, e.created_at, p.reference_no, p.title, p.price, p.listing_type,
              (pp.id IS NOT NULL) AS live
         FROM enquiries e
         LEFT JOIN properties p ON p.id = e.property_id
         LEFT JOIN public_properties pp ON pp.id = e.property_id
        WHERE e.user_id = ? ORDER BY e.created_at DESC`,
      [member.id],
    ),
    unreadReplies(member.id),
  ]);
  const messages = enquiries.length
    ? await db.all<EnquiryMessage>(
        // Staff author names stay private; members see the brokerage name.
        "SELECT id, enquiry_id, sender, body, read_at, created_at FROM enquiry_messages WHERE enquiry_id IN (?) ORDER BY created_at",
        [enquiries.map((e) => e.id)],
      )
    : [];

  return (
    <AccountShell active="/account/enquiries" name={member.profile.name} phone={member.phone} unread={unread}>
      <MarkRepliesRead unread={unread} />
      {enquiries.length === 0 ? (
        <div className="card p-10 text-center text-sm text-zinc-500">
          You haven&apos;t sent any enquiries yet.{" "}
          <Link href="/properties" className="text-brand-700 hover:underline">
            Browse properties
          </Link>{" "}
          and tap “Talk to us” on any listing.
        </div>
      ) : (
        <ul className="space-y-4">
          {enquiries.map((e) => {
            const thread = messages.filter((m) => m.enquiry_id === e.id);
            const answered = thread.some((m) => m.sender === "staff");
            return (
              <li key={e.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    {e.reference_no && e.live ? (
                      <Link href={`/properties/${e.reference_no}`} className="font-medium text-brand-700 hover:underline">
                        {e.title}
                      </Link>
                    ) : (
                      <p className="font-medium">{e.title ?? "Listing no longer available"}</p>
                    )}
                    <p className="text-sm text-zinc-500">
                      {e.reference_no}
                      {e.price && e.listing_type ? ` · ${formatPrice(e.price, e.listing_type)}` : ""}
                    </p>
                  </div>
                  <span className={`badge ${answered ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{answered ? "Replied" : "Awaiting reply"}</span>
                </div>
                <Bubble mine at={e.created_at} body={e.message || "I'm interested in this property."} />
                {thread.map((m) => (
                  <Bubble key={m.id} mine={m.sender === "member"} at={m.created_at} body={m.body} fresh={m.sender === "staff" && !m.read_at} />
                ))}
                <MessageForm enquiryId={e.id} />
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
}

function Bubble({ mine, at, body, fresh }: { mine: boolean; at: string; body: string; fresh?: boolean }) {
  return (
    <div className={`flex ${mine ? "justify-end" : ""}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-brand-50 text-brand-900" : "bg-zinc-100 text-zinc-800"} ${fresh ? "ring-2 ring-brand-300" : ""}`}>
        <p className="whitespace-pre-line">{body}</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {mine ? "You" : site.name} · {formatDateTime(at)}
          {fresh && <span className="ml-1 font-medium text-brand-700">New</span>}
        </p>
      </div>
    </div>
  );
}
