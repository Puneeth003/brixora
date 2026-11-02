import Image from "next/image";
import Link from "next/link";
import { site } from "@/lib/site";

/**
 * Full-screen sign-in scene: the coast photo behind, a headline on the left and the
 * form card on the right (stacked on phones). Used by the member and staff logins.
 */
export function AuthScene({
  title,
  subtitle,
  children,
  logo = true,
}: {
  title: React.ReactNode;
  subtitle: string;
  children: React.ReactNode;
  /** Show the wordmark top-left (off when the site header is already above). */
  logo?: boolean;
}) {
  return (
    <section className="relative isolate flex min-h-[calc(100dvh-4rem)] flex-1 items-center overflow-hidden">
      <Image src="/hero/hero-coast-villa.webp" alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/65 via-black/35 to-black/10" />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_440px] lg:gap-16 lg:py-16">
        <div className="text-white">
          {logo && (
            <Link href="/" className="mb-10 inline-block lg:mb-16" aria-label={`${site.name} home`}>
              <Image src="/brand/wordmark-dark.svg" alt={site.name} width={1014} height={182} unoptimized className="h-8 w-auto" />
            </Link>
          )}
          <h1 className="max-w-lg text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-4 max-w-md text-base text-white/85 sm:text-lg">{subtitle}</p>
        </div>
        <div className="w-full rounded-[28px] bg-[#fdf6ee]/95 p-7 shadow-2xl ring-1 ring-black/5 backdrop-blur sm:p-9">{children}</div>
      </div>
    </section>
  );
}

/** "──── or ────" divider for the auth cards. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
      <span className="h-px flex-1 bg-zinc-300/80" />
      or
      <span className="h-px flex-1 bg-zinc-300/80" />
    </div>
  );
}
