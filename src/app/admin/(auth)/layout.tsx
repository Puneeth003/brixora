import type { Metadata } from "next";
import Image from "next/image";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const features = ["Listings & approvals", "CRM & follow-ups", "Agents & brokers"];

function LogoBadge({ className = "size-12" }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-white p-1.5 ring-1 ring-black/5 ${className}`}>
      <Image src="/brand/logo-light.svg" alt="" width={48} height={48} unoptimized className="h-full w-full object-contain" />
    </span>
  );
}

/** Split sign-in screen: dark brand panel on desktop, centred card on phones. */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 bg-[var(--s-bg)] p-4 sm:p-6 lg:gap-6">
      <aside
        className="relative hidden w-[44%] max-w-xl shrink-0 flex-col justify-between overflow-hidden rounded-[28px] bg-[var(--sidebar-bg)] p-10 text-white lg:flex"
        aria-label={`${site.name} admin`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 size-[420px] rounded-full"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--brand) 55%, transparent) 0%, transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-[380px] rounded-full"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--brand) 35%, transparent) 0%, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <LogoBadge />
          <span>
            <span className="block text-lg font-extrabold tracking-tight">{site.name}</span>
            <span className="block text-xs font-semibold text-white/50">Staff workspace</span>
          </span>
        </div>

        <div className="relative space-y-8">
          <h2 className="max-w-sm text-[32px] leading-tight font-extrabold tracking-tight">Run listings, clients and agents from one place.</h2>
          <ul className="space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-[15px] font-semibold text-white/85">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] shadow-[0_6px_14px_-4px_color-mix(in_srgb,var(--brand)_60%,transparent)]">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs font-semibold text-white/40">Authorised staff only.</p>
      </aside>

      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[420px] space-y-6">
          <div className="flex flex-col items-center gap-2 lg:hidden">
            <LogoBadge className="size-14 shadow-[var(--s-shadow)]" />
            <span className="text-lg font-extrabold tracking-tight">{site.name}</span>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
