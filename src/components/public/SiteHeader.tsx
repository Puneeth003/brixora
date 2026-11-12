import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { site, whatsappLink } from "@/lib/site";
import { PhoneIcon } from "@/components/icons";
import { HeaderMobileMenu, HeaderProfile } from "./HeaderProfile";
import { MobileMenuFallback, NavLinks } from "./NavLinks";
import { ProfileFallback } from "./ProfileMenu";

/** Brand artwork from public/brand (green/gold wordmark). `light` = for dark backgrounds. */
export function BrandLogo({ light = false, tagline = false }: { light?: boolean; tagline?: boolean }) {
  return (
    <Link href="/" className="flex items-center" aria-label={`${site.name} home`}>
      <Image
        src={`/brand/${tagline ? "logo" : "wordmark"}-${light ? "dark" : "light"}.svg`}
        alt={site.name}
        width={1014}
        height={tagline ? 248 : 182}
        unoptimized
        className={tagline ? "h-14 w-auto" : "h-7 w-auto lg:h-9"}
      />
    </Link>
  );
}

export function SiteHeader() {
  const contact =
    whatsappLink(`Hi ${site.name}, I'd like to talk about a property in ${site.defaultCity}.`) ??
    (site.brokerage.phone ? `tel:+${site.brokerage.phone.replace(/\D/g, "")}` : "/#contact");

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/95 backdrop-blur">
      <div className="relative mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:h-[4.75rem] lg:w-[84%] lg:px-0">
        <BrandLogo />
        <div className="flex items-center gap-1 lg:gap-2">
          <Suspense fallback={null}>
            <NavLinks />
          </Suspense>
          <span className="mx-2 hidden h-6 w-px bg-zinc-200 lg:block" />
          {/* Profile: "Sign in" when signed out, avatar + dropdown when signed in. Reads the session cookie, so it streams in. */}
          <Suspense fallback={<ProfileFallback />}>
            <HeaderProfile />
          </Suspense>
          <a
            href={contact}
            target={contact.startsWith("http") ? "_blank" : undefined}
            rel="noopener"
            className="btn-primary hidden sm:inline-flex lg:rounded-xl lg:px-6 lg:py-3 lg:text-base"
          >
            <PhoneIcon />
            Contact Now
          </a>
          <Suspense fallback={<MobileMenuFallback />}>
            <HeaderMobileMenu contactHref={contact} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
