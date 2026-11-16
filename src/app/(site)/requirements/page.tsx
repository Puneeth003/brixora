import type { Metadata } from "next";
import { getLocalities } from "@/lib/queries";
import { site } from "@/lib/site";
import { RequirementForm } from "@/components/public/RequirementForm";

export const metadata: Metadata = {
  title: "Tell us what you need",
  description: `Can't find the right property in ${site.defaultCity}? Tell ${site.name} what you are looking for and our team will find it for you.`,
  alternates: { canonical: "/requirements" },
};

export default async function RequirementsPage() {
  const localities = await getLocalities();
  return (
    <div className="container-page py-10">
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tell us what you need</h1>
          <p className="mt-2 max-w-2xl text-zinc-600">
            Can&apos;t find the right property? Tell us what you are looking for. Our team checks it against our verified listings and calls you
            with what fits.
          </p>
          <div className="card mt-6 p-5 sm:p-6">
            <RequirementForm localities={localities.map((l) => l.locality).sort((a, b) => a.localeCompare(b))} />
          </div>
        </div>
        <aside className="space-y-4 lg:pt-24">
          {[
            ["1. You tell us", "Buy or rent, the type of property, where, and your budget. It takes a minute."],
            ["2. We match", `Your requirement goes straight to the ${site.name} team, who match it against verified listings.`],
            ["3. We call you", "One advisor calls you with the properties that fit and arranges visits."],
          ].map(([title, body]) => (
            <div key={title} className="card p-4">
              <p className="font-semibold text-ink">{title}</p>
              <p className="mt-1 text-sm text-zinc-600">{body}</p>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
