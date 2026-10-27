import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadClientFor, matchingListings, staffOptions } from "@/lib/crm";
import { displayPhone, formatDate, formatDateTime, formatPrice } from "@/lib/format";
import { istInputValue, nowMs } from "@/lib/time";
import { publicImageUrl } from "@/lib/site";
import { ACTIVITY_TYPES, CLIENT_SOURCES, label } from "@/lib/crm-constants";
import { PropertyStatusBadge } from "@/components/StatusBadge";
import { ClientStatusBadge, FollowUp, requirementSummary } from "@/components/crm/ClientBadges";
import { ActivityForm, ClientForm, ReplyForm, StatusForm } from "@/components/crm/forms";
import { deleteClient, markEnquiryRead } from "../../../crm-actions";
import type { ClientActivity, EnquiryMessage, PropertyStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Client" };

type EnquiryRow = { id: string; message: string | null; created_at: string; user_id: string | null; property_id: string | null; reference_no: string | null; title: string | null };

export default async function ClientPage({ params }: PageProps<"/admin/clients/[id]">) {
  const staff = await requireStaff();
  await connection();
  const { id } = await params;
  const c = await loadClientFor(staff, id);
  if (!c) notFound();
  const now = nowMs();

  const [activities, enquiries, people, member, interest, matches, staffList] = await Promise.all([
    db.all<ClientActivity & { actor_name: string | null; reference_no: string | null }>(
      `SELECT a.*, u.name AS actor_name, p.reference_no FROM client_activities a
         LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN properties p ON p.id = a.property_id
        WHERE a.client_id = ? ORDER BY a.created_at DESC LIMIT 200`,
      [c.id],
    ),
    db.all<EnquiryRow>(
      `SELECT e.id, e.message, e.created_at, e.user_id, e.property_id, p.reference_no, p.title
         FROM enquiries e LEFT JOIN properties p ON p.id = e.property_id
        WHERE e.client_id = ? ORDER BY e.created_at DESC`,
      [c.id],
    ),
    db.all<{ id: string; name: string | null; email: string | null; work_phone: string | null }>(
      "SELECT id, name, email, work_phone FROM users WHERE id IN (?)",
      [[c.assigned_to ?? "", c.broker_id ?? ""]],
    ),
    db.one<{ id: string; name: string | null; created_at: string; last_login_at: string | null; is_active: boolean }>(
      "SELECT id, name, created_at, last_login_at, is_active FROM users WHERE phone = ? AND role = 'owner'",
      [c.phone],
    ),
    c.property_id
      ? db.one<{ id: string; reference_no: string; title: string; price: number; listing_type: "sale" | "rent"; status: PropertyStatus }>(
          "SELECT id, reference_no, title, price, listing_type, status FROM properties WHERE id = ?",
          [c.property_id],
        )
      : Promise.resolve(null),
    matchingListings(c),
    staffOptions(),
  ]);

  const messages = enquiries.length
    ? await db.all<EnquiryMessage & { author_name: string | null }>(
        `SELECT m.*, u.name AS author_name FROM enquiry_messages m LEFT JOIN users u ON u.id = m.author_id
          WHERE m.enquiry_id IN (?) ORDER BY m.created_at`,
        [enquiries.map((e) => e.id)],
      )
    : [];
  const ownedListings = member
    ? await db.all<{ id: string; reference_no: string; title: string; status: PropertyStatus; price: number; listing_type: "sale" | "rent" }>(
        "SELECT id, reference_no, title, status, price, listing_type FROM properties WHERE owner_id = ? AND status <> 'draft' ORDER BY created_at DESC",
        [member.id],
      )
    : [];
  const savedCount = member ? await db.count("SELECT COUNT(*) FROM saved_properties WHERE user_id = ?", [member.id]) : 0;

  const person = (pid: string | null) => people.find((p) => p.id === pid);
  const agent = person(c.assigned_to);
  const broker = person(c.broker_id);
  const propertyChoices = [
    ...(interest ? [{ id: interest.id, label: `${interest.reference_no} · ${interest.title}` }] : []),
    ...enquiries.filter((e) => e.property_id && e.reference_no).map((e) => ({ id: e.property_id!, label: `${e.reference_no} · ${e.title}` })),
    ...matches.map((m) => ({ id: m.id, label: `${m.reference_no} · ${m.title}` })),
  ].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  const wa = `https://wa.me/${c.phone}`;

  const initials =
    c.name
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const chip = "inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[var(--s-text)] shadow-[var(--s-shadow)] transition hover:text-[var(--brand)]";

  return (
    <div className="space-y-6">
      <Link href="/admin/clients" className="inline-flex items-center gap-1 text-sm font-bold text-[var(--s-muted)] hover:text-[var(--brand)]">
        ← Clients
      </Link>

      <header className="card flex flex-wrap items-center gap-5 p-6">
        <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[var(--s-brand-soft)] text-xl font-extrabold text-[var(--brand)]">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{c.name}</h1>
            <ClientStatusBadge status={c.status} />
            {member && <span className="badge bg-[var(--s-brand-soft)] text-[var(--brand)]">Member</span>}
          </div>
          <p className="mt-1 text-sm text-[var(--s-muted)]">
            {label(CLIENT_SOURCES, c.source)} · added {formatDate(c.created_at)}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <a href={`tel:+${c.phone}`} className={chip}>
            <span aria-hidden>☎</span> {displayPhone(c.phone)}
          </a>
          <a href={wa} target="_blank" rel="noopener" className={chip}>
            <span aria-hidden className="text-[var(--brand)]">●</span> WhatsApp ↗
          </a>
          {c.email && (
            <a href={`mailto:${c.email}`} className={`${chip} max-w-full`}>
              <span aria-hidden>✉</span> <span className="truncate">{c.email}</span>
            </a>
          )}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <section className="card space-y-4 p-6">
            <SectionTitle>Pipeline</SectionTitle>
            <StatusForm client={c} />
            {c.status === "lost" && c.lost_reason && <p className="text-sm text-[var(--s-muted)]">Lost: {c.lost_reason}</p>}
          </section>

          <section className="card space-y-4 p-6">
            <SectionTitle>Log a call, visit or note</SectionTitle>
            <ActivityForm clientId={c.id} properties={propertyChoices} />
          </section>

          {enquiries.length > 0 && (
            <section className="space-y-3">
              <SectionTitle count={enquiries.length}>Website enquiries</SectionTitle>
              {enquiries.map((e) => {
                const thread = messages.filter((m) => m.enquiry_id === e.id);
                const unread = thread.some((m) => m.sender === "member" && !m.read_at);
                return (
                  <div key={e.id} id={`enquiry-${e.id}`} className="card space-y-3 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <p className="flex min-w-0 flex-wrap items-center gap-2">
                        {e.reference_no ? (
                          <Link
                            href={`/properties/${e.reference_no}`}
                            target="_blank"
                            className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--brand)] hover:underline"
                          >
                            {e.reference_no}
                          </Link>
                        ) : (
                          <span className="text-[var(--s-muted)]">Listing removed</span>
                        )}
                        <span className="truncate font-semibold text-[var(--s-text-2)]">{e.title}</span>
                        {unread && <span className="rounded-full bg-[var(--s-late)] px-2 py-0.5 text-[11px] font-extrabold text-white">New</span>}
                      </p>
                      <span className="text-xs text-[var(--s-muted)]">{formatDateTime(e.created_at)}</span>
                    </div>
                    <div className="space-y-2.5">
                      <Bubble side="member" name={c.name} at={e.created_at} body={e.message || "(no message)"} />
                      {thread.map((m) => (
                        <Bubble key={m.id} side={m.sender} name={m.sender === "staff" ? (m.author_name ?? "Team") : c.name} at={m.created_at} body={m.body} unread={m.sender === "member" && !m.read_at} />
                      ))}
                    </div>
                    {!e.user_id && <p className="text-xs text-[var(--s-muted)]">Not signed up yet: they&apos;ll see replies once they sign in with {displayPhone(c.phone)}.</p>}
                    <div className="border-t border-[var(--s-border)] pt-3">
                      <ReplyForm enquiryId={e.id} />
                    </div>
                    {unread && (
                      <form action={markEnquiryRead.bind(null, e.id)}>
                        <button className="text-xs font-bold text-[var(--brand)] hover:underline">Mark as read</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          <section className="card p-6">
            <SectionTitle count={activities.length || undefined}>Timeline</SectionTitle>
            {activities.length ? (
              <ol className="relative mt-4 space-y-4 text-sm before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-0.5 before:bg-[var(--s-border)]">
                {activities.map((a) => (
                  <li key={a.id} className="relative pl-7">
                    <span aria-hidden className={`absolute left-0 top-1 h-3 w-3 rounded-full ring-4 ring-white ${DOT[a.type] ?? "bg-zinc-400"}`} />
                    <p>
                      <span className="font-bold">{label(ACTIVITY_TYPES, a.type)}</span>{" "}
                      <span className="text-[var(--s-muted)]">
                        {a.actor_name ? `by ${a.actor_name} · ` : ""}
                        {formatDateTime(a.created_at)}
                        {a.reference_no ? ` · ${a.reference_no}` : ""}
                      </span>
                    </p>
                    {a.body && <p className="mt-1 whitespace-pre-line text-[var(--s-text-2)]">{a.body}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-[var(--s-muted)]">Nothing logged yet.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card space-y-4 p-6 text-sm">
            <SectionTitle>Summary</SectionTitle>
            <p className="font-semibold text-[var(--s-text-2)]">{requirementSummary(c)}</p>
            <dl className="divide-y divide-[var(--s-border)]">
              <Row term="Next follow-up">
                <FollowUp at={c.next_follow_up} now={now} />
              </Row>
              <Row term="Last contact">{formatDateTime(c.last_contact_at)}</Row>
              <Row term="Agent">{agent ? (agent.name ?? agent.email) : <span className="text-amber-700">Unassigned</span>}</Row>
              {broker && (
                <Row term="Broker">
                  {broker.name ?? broker.email}
                  {broker.work_phone ? ` · ${broker.work_phone}` : ""}
                </Row>
              )}
              {interest && (
                <Row term="Interested in">
                  <Link href={staff.role === "admin" ? `/admin/properties/${interest.id}` : `/properties/${interest.reference_no}`} className="font-bold text-[var(--brand)] hover:underline">
                    {interest.reference_no}
                  </Link>{" "}
                  · {formatPrice(interest.price, interest.listing_type)} <PropertyStatusBadge status={interest.status} />
                </Row>
              )}
            </dl>
            {c.notes && <p className="whitespace-pre-line rounded-2xl bg-[var(--s-bg)] p-4 text-[var(--s-text-2)]">{c.notes}</p>}
          </section>

          {member && (
            <section className="card space-y-3 p-6 text-sm">
              <SectionTitle>Member account</SectionTitle>
              <p className="text-[var(--s-text-2)]">
                Joined {formatDate(member.created_at)} · last sign-in {formatDate(member.last_login_at)}
                {!member.is_active && <span className="badge ml-2 bg-red-100 text-red-700">Blocked</span>}
              </p>
              <p className="text-[var(--s-text-2)]">
                {savedCount} saved propert{savedCount === 1 ? "y" : "ies"}
              </p>
              {ownedListings.length > 0 && (
                <ul className="space-y-1.5">
                  {ownedListings.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[var(--s-bg)] px-3 py-2">
                      <Link href={staff.role === "admin" ? `/admin/properties/${p.id}` : `/properties/${p.reference_no}`} className="font-mono text-xs font-bold text-[var(--brand)] hover:underline">
                        {p.reference_no}
                      </Link>
                      <PropertyStatusBadge status={p.status} />
                      <span className="truncate text-[var(--s-text-2)]">{p.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {matches.length > 0 && (
            <section className="space-y-3">
              <SectionTitle count={matches.length}>Matching listings</SectionTitle>
              <ul className="flex flex-col gap-2.5">
                {matches.map((m) => {
                  const img = publicImageUrl(m.cover_path);
                  return (
                    <li key={m.id}>
                      <Link
                        href={`/properties/${m.reference_no}`}
                        target="_blank"
                        className="flex items-center gap-3 rounded-[20px] bg-white p-2.5 pr-4 shadow-[var(--s-shadow)] transition hover:shadow-[var(--s-shadow-lg)]"
                      >
                        <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--s-seg)]">
                          {img && <Image src={img} alt="" fill sizes="80px" className="object-cover" />}
                        </div>
                        <div className="min-w-0 text-sm">
                          <p className="truncate font-bold">{m.title}</p>
                          <p className="text-[var(--s-muted)]">
                            {formatPrice(m.price, m.listing_type)} · {m.locality}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="px-1 text-xs text-[var(--s-muted)]">Based on the requirements in Details. Share a link on WhatsApp, then log it.</p>
            </section>
          )}

          <details className="card group p-6">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[20px] font-extrabold">
              Edit details
              <span aria-hidden className="text-base text-[var(--s-muted)] transition group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="mt-5">
              <ClientForm client={c} staff={staffList} isAdmin={staff.role === "admin"} followUpValue={istInputValue(c.next_follow_up)} />
            </div>
          </details>

          {staff.role === "admin" && (
            <form action={deleteClient.bind(null, c.id)} className="px-1">
              <button className="text-sm font-bold text-[var(--s-late)] hover:underline">Delete client and timeline</button>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}

const DOT: Record<string, string> = {
  note: "bg-zinc-400",
  call: "bg-sky-500",
  whatsapp: "bg-emerald-500",
  email: "bg-indigo-500",
  meeting: "bg-amber-500",
  site_visit: "bg-violet-500",
  status: "bg-[var(--brand)]",
  assigned: "bg-pink-500",
  enquiry: "bg-cyan-500",
};

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="flex items-center gap-2 text-[20px] font-extrabold tracking-tight">
      {children}
      {count !== undefined && <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{count}</span>}
    </h2>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="shrink-0 font-semibold text-[var(--s-muted)]">{term}</dt>
      <dd className="min-w-0 text-right font-semibold text-[var(--s-text)]">{children}</dd>
    </div>
  );
}

function Bubble({ side, name, at, body, unread }: { side: "staff" | "member"; name: string; at: string; body: string; unread?: boolean }) {
  const staff = side === "staff";
  return (
    <div className={`flex ${staff ? "justify-end" : ""}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${staff ? "rounded-br-md bg-[var(--s-brand-soft)] text-[var(--s-text)]" : "rounded-bl-md bg-[var(--s-seg)] text-[var(--s-text)]"} ${
          unread ? "ring-2 ring-red-300" : ""
        }`}
      >
        <p className="whitespace-pre-line">{body}</p>
        <p className={`mt-1 text-[11px] font-semibold text-[var(--s-muted)] ${staff ? "text-right" : ""}`}>
          {name} · {formatDateTime(at)}
        </p>
      </div>
    </div>
  );
}
