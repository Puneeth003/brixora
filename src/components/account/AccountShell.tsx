import Link from "next/link";
import { displayPhone } from "@/lib/format";
import { memberSignOut } from "@/app/(site)/account/actions";

const TABS = [
  { href: "/account", label: "Overview" },
  { href: "/account/enquiries", label: "My enquiries" },
  { href: "/manage", label: "My listings" },
  { href: "/account/saved", label: "Saved" },
];

export function AccountShell({
  active,
  name,
  phone,
  unread,
  children,
}: {
  active: string;
  name: string | null;
  phone: string;
  unread?: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
          <p className="text-sm text-zinc-500">
            {name ? `${name} · ` : ""}
            {displayPhone(phone)}
          </p>
        </div>
        <form action={memberSignOut}>
          <button className="btn-secondary">Sign out</button>
        </form>
      </div>
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-zinc-200">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
              active === t.href ? "border-brand-600 font-medium text-brand-800" : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
            {t.href === "/account/enquiries" && unread ? <span className="badge ml-1.5 bg-red-100 text-red-700">{unread}</span> : null}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
