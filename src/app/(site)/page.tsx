import Image from "next/image";
import Link from "next/link";
import { getFeaturedListings, getListingStats, getLocalities } from "@/lib/queries";
import { site, whatsappLink } from "@/lib/site";
import { slugify } from "@/lib/format";
import { PropertyCard } from "@/components/public/PropertyCard";
import { HeroSearch } from "@/components/public/HeroSearch";
import { Pagination } from "@/components/Pagination";
import { PAGE_SIZE } from "@/lib/constants";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  BuildingIcon,
  HomeIcon,
  LockIcon,
  ShieldIcon,
  StoreIcon,
  SunIcon,
  TagIcon,
  UserIcon,
} from "@/components/icons";

const CATEGORIES = [
  {
    title: "Apartments",
    text: "Modern flats with lifts, parking and security",
    href: "/properties?type=apartment",
    image: "/samples/kadri-1.webp",
    icon: BuildingIcon,
  },
  {
    title: "Houses & Villas",
    text: "Independent homes with gardens and space",
    href: "/properties?type=villa,independent_house",
    image: "/samples/derebail-1.webp",
    icon: HomeIcon,
  },
  {
    title: "Offices",
    text: "Ready-to-move offices in prime locations",
    href: "/properties?type=office,commercial",
    image: "/samples/hampankatta-1.webp",
    icon: BriefcaseIcon,
  },
  {
    title: "Retail Spaces",
    text: "Showrooms and shops on busy main roads",
    href: "/properties?type=shop,warehouse",
    image: "/samples/falnir-1.webp",
    icon: StoreIcon,
  },
];

function SectionHeading({ eyebrow, line1, line2 }: { eyebrow: string; line1: string; line2: string }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-3xl leading-tight font-bold tracking-tight text-ink sm:text-4xl">
        {line1}
        <br />
        <span className="text-brand-600">{line2}</span>
      </h2>
    </div>
  );
}

export default async function Home() {
  const [featured, localities, stats] = await Promise.all([getFeaturedListings(PAGE_SIZE), getLocalities(), getListingStats()]);
  const wa = whatsappLink(`Hi ${site.name}, I'd like to list my property.`);

  return (
    <>
      {/* Hero */}
      <section className="relative isolate z-10 flex min-h-[640px] flex-col bg-[#fbf6ec] lg:min-h-[calc(100svh-4.75rem)]">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/hero/hero-coast-villa.webp"
            alt={`Modern villa with an infinity pool overlooking the sea at sunset in ${site.defaultCity}`}
            fill
            priority
            quality={90}
            sizes="100vw"
            className="object-cover object-[65%_center]"
          />
        </div>
        {/* Light wash behind the text so it stays readable over the sky */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#fbf6ec]/80 from-5% via-[#fbf6ec]/40 via-35% to-transparent to-55%" />
        <div className="absolute inset-x-0 top-0 -z-10 h-1/2 bg-gradient-to-b from-[#fbf6ec]/35 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-[#fbf6ec]/55 lg:hidden" />

        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col justify-between gap-10 px-4 pt-12 pb-12 sm:px-6 lg:w-[84%] lg:px-0 lg:gap-[clamp(1.5rem,5vh,3rem)] lg:pt-[clamp(1.5rem,12vh,8rem)] lg:pb-[clamp(1.5rem,10vh,7rem)]">
          <div>
            <span className="inline-flex items-center gap-2.5 rounded-full border border-gold-300/70 bg-white/90 px-4 py-2 text-sm font-medium lg:text-base text-zinc-800 shadow-sm backdrop-blur">
              <SunIcon className="text-gold-500" />
              Verified properties in {site.defaultCity}
            </span>
            <h1 className="mt-6 text-4xl leading-[1.05] font-bold tracking-[-0.03em] text-ink sm:text-6xl lg:mt-[clamp(1rem,3vh,2rem)] lg:text-[clamp(2.75rem,8.5vh,5rem)] lg:leading-[1.02]">
              Find Your Dream
              <br />
              Home in{" "}
              <Image
                src="/brand/mangalore-script.webp"
                alt={site.defaultCity}
                width={1984}
                height={471}
                quality={90}
                priority
                sizes="(min-width: 1024px) 640px, 80vw"
                className="ml-[-0.05em] inline-block h-[1.35em] w-auto max-w-full align-[-0.5em]"
              />
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-zinc-600 sm:text-xl lg:mt-[clamp(1rem,3vh,2rem)] lg:text-[clamp(1.05rem,2.4vh,1.375rem)]">
              Explore hand-checked homes, plots and commercial spaces across {site.defaultCity}, with one trusted advisor
              from first visit to registration.
            </p>
          </div>

          <div>
            <HeroSearch localities={localities.map((l) => l.locality)} />
          </div>
        </div>
      </section>

      {/* Property types */}
      <section className="container-page py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow="Choose by property type" line1="Find a Property That" line2="Fits Your Lifestyle" />
          <Link href="/properties" className="btn-secondary">
            View All Properties <ArrowRightIcon />
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image src={c.image} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div className="relative px-5 pt-9 pb-5">
                <span className="absolute -top-7 left-5 grid size-14 place-items-center rounded-full bg-white text-brand-700 shadow-md ring-4 ring-white">
                  <c.icon className="size-6!" />
                </span>
                <h3 className="text-lg font-semibold text-ink">{c.title}</h3>
                <p className="mt-1 text-sm text-zinc-500">{c.text}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                  Explore Now <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured */}
      <section className="bg-[#eef3ec] py-16">
        <div className="container-page">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <SectionHeading eyebrow="Featured properties" line1="Handpicked Properties" line2="Just For You" />
            <Link href="/properties" className="btn-secondary">
              View All Properties <ArrowRightIcon />
            </Link>
          </div>
          {featured.length ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((p) => (
                <PropertyCard key={p.id} p={p} />
              ))}
            </div>
          ) : null}
          {featured.length > 0 && (
            <div className="mt-8">
              <p className="text-center text-sm text-zinc-500">
                Showing 1–{featured.length} of {stats.live} properties
              </p>
              <Pagination page={1} pages={Math.ceil(stats.live / PAGE_SIZE)} basePath="/properties" params={{}} />
            </div>
          )}
          {featured.length === 0 && (
            <div className="rounded-2xl bg-white p-10 text-center text-zinc-500">
              New listings are on their way.{" "}
              <Link href="/post" className="text-brand-700 underline">
                Post your property
              </Link>
              .
            </div>
          )}
        </div>
      </section>

      {/* Owner KPIs — listing is the core of the business */}
      <section className="container-page -mt-2 py-12">
        <div className="overflow-hidden rounded-2xl bg-brand-700 text-white shadow-xl shadow-brand-900/20">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 px-6 py-5 sm:px-8">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-gold-300 uppercase">For property owners</p>
              <h2 className="mt-1 text-xl font-bold sm:text-2xl">Sell or rent out your property with {site.name}</h2>
            </div>
            <Link
              href="/post"
              className="btn bg-gradient-to-b from-gold-400 to-gold-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-black/20 hover:from-gold-500 hover:to-gold-600"
            >
              List your property <ArrowRightIcon />
            </Link>
          </div>
          <div className="grid gap-6 px-6 py-7 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:divide-x lg:divide-white/15">
            {[
              { icon: TagIcon, value: "5 min", label: "To submit your listing" },
              { icon: ShieldIcon, value: "1–2 days", label: "Reviewed & live" },
              { icon: LockIcon, value: "100%", label: "Owner privacy, number never shown" },
              { icon: HomeIcon, value: stats.live, label: `Verified listings live in ${site.defaultCity}` },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-4 lg:justify-center lg:px-4">
                <s.icon className="size-10! text-gold-300" strokeWidth={1.5} />
                <div>
                  <p className="text-3xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-sm text-brand-100">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="container-page py-12">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">Why {site.name}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Buying and renting, <span className="text-brand-600">without the noise</span>
          </h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { icon: ShieldIcon, title: "Verified before it's live", text: "Our team reviews every submission, photos included, before it appears on the site." },
            { icon: UserIcon, title: "One point of contact", text: `You deal only with ${site.name}. No spam calls from a dozen brokers.` },
            { icon: LockIcon, title: "Owner privacy protected", text: "Owner names, numbers and exact addresses are never published. Listings show the locality only." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
              <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <f.icon className="size-6!" />
              </span>
              <h3 className="mt-4 font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm text-zinc-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Localities */}
      {localities.length > 0 && (
        <section className="container-page pb-4">
          <h2 className="mb-4 text-xl font-semibold text-ink">Popular localities in {site.defaultCity}</h2>
          <div className="flex flex-wrap gap-2">
            {localities.map((l) => (
              <Link
                key={l.locality}
                href={`/localities/${slugify(l.locality)}`}
                className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 transition hover:border-brand-300 hover:text-brand-700"
              >
                {l.locality} <span className="text-zinc-400">· {l.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Owner CTA */}
      <section className="container-page py-12">
        <div className="relative overflow-hidden rounded-3xl bg-ink px-8 py-10 text-white sm:px-12">
          <div className="absolute -top-20 -right-20 size-72 rounded-full bg-brand-600/40 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Own a property in {site.defaultCity}?</h2>
              <p className="mt-2 max-w-xl text-zinc-300">
                List it in 5 minutes with just your phone number. We review it, polish the listing and handle every
                enquiry. Your number stays private.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/post" className="btn bg-white px-6 py-3 text-ink hover:bg-brand-50">
                Post your property <ArrowRightIcon />
              </Link>
              {wa && (
                <a href={wa} target="_blank" rel="noopener" className="btn border border-white/30 px-6 py-3 text-white hover:bg-white/10">
                  WhatsApp us
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
