import { Suspense } from "react";
import { CompareBar } from "@/components/public/Compare";
import { SiteFooter } from "@/components/public/SiteFooter";
import { SiteHeader } from "@/components/public/SiteHeader";
import { SideCta } from "@/components/public/SideCta";
import { getSite, whatsappLinkFor } from "@/lib/site-settings";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  const phone = site.brokerage.phone.replace(/\D/g, "");
  return (
    <>
      <SiteHeader />
      <main className="site-fluid flex-1">{children}</main>
      <SiteFooter />
      <SideCta
        whatsappHref={whatsappLinkFor(site, `Hi ${site.name}, I'd like to know more about your properties.`)}
        phoneHref={phone ? `tel:+${phone}` : null}
      />
      {/* Reads the address in the browser, so it must not hold up the prerendered page. */}
      <Suspense fallback={null}>
        <CompareBar />
      </Suspense>
    </>
  );
}
