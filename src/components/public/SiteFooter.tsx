import Link from "next/link";
import { site, whatsappLink } from "@/lib/site";
import { displayPhone } from "@/lib/format";
import { MapPinIcon, PhoneIcon } from "@/components/icons";
import { BrandLogo } from "./SiteHeader";

export function SiteFooter() {
  const wa = whatsappLink(`Hi ${site.name}, I'd like to know more about your properties.`);
  const linkCls = "text-zinc-400 transition hover:text-white";
  return (
    <footer id="contact" className="mt-16 bg-ink text-sm text-zinc-300">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-2">
          <BrandLogo light tagline />
          <p className="max-w-sm text-zinc-400">
            {site.tagline} Homes, plots and commercial spaces across {site.defaultCity}, every listing checked by our team.
          </p>
          {site.brokerage.reraNo && <p className="text-xs text-zinc-500">RERA Karnataka agent reg. {site.brokerage.reraNo}</p>}
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-white">Explore</h3>
          <ul className="space-y-2">
            <li>
              <Link href="/properties?listing=sale" className={linkCls}>
                Properties for sale
              </Link>
            </li>
            <li>
              <Link href="/properties?listing=rent" className={linkCls}>
                Properties for rent
              </Link>
            </li>
            <li>
              <Link href="/localities" className={linkCls}>
                Localities
              </Link>
            </li>
            <li>
              <Link href="/post" className={linkCls}>
                Post your property
              </Link>
            </li>
            <li>
              <Link href="/manage" className={linkCls}>
                Manage my listing
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={linkCls}>
                Privacy policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className={linkCls}>
                Terms of use
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 font-semibold text-white">Contact us</h3>
          <ul className="space-y-2">
            {site.brokerage.phone && (
              <li>
                <a href={`tel:+${site.brokerage.phone.replace(/\D/g, "")}`} className={`flex items-center gap-2 ${linkCls}`}>
                  <PhoneIcon /> {displayPhone(site.brokerage.phone)}
                </a>
              </li>
            )}
            {wa && (
              <li>
                <a href={wa} target="_blank" rel="noopener" className={linkCls}>
                  WhatsApp us
                </a>
              </li>
            )}
            {site.brokerage.email && (
              <li>
                <a href={`mailto:${site.brokerage.email}`} className={linkCls}>
                  {site.brokerage.email}
                </a>
              </li>
            )}
            <li className="flex items-start gap-2 text-zinc-400">
              <MapPinIcon className="mt-0.5" /> {site.brokerage.address || site.defaultCity}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-zinc-500">
        All enquiries are handled by {site.name}. Owner details are never shared.
      </div>
    </footer>
  );
}
