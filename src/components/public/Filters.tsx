import Link from "next/link";
import { BHK_OPTIONS, FURNISHING, PROPERTY_TYPES, RENT_BUDGETS, SALE_BUDGETS } from "@/lib/constants";
import type { ListingFilters } from "@/lib/queries";
import { Dropdown } from "@/components/Dropdown";

// Plain GET form: works without JavaScript and keeps filter state in the URL.
export function Filters({ f, localities }: { f: ListingFilters; localities: string[] }) {
  const budgets = f.listing === "rent" ? RENT_BUDGETS : SALE_BUDGETS;
  // Grouped values (e.g. "villa,independent_house" from the home page) need an option too.
  const typeGroup = f.type?.includes(",") ? [{ value: f.type, label: "Selected group" }] : [];
  return (
    <form action="/properties" method="get" className="card space-y-4 p-4">
      <div>
        <label className="label" htmlFor="f-q">
          Search
        </label>
        <input id="f-q" name="q" defaultValue={f.q} className="input" placeholder="Locality, project…" />
      </div>
      <div>
        <span className="label">Looking to</span>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["sale", "Buy"],
            ["rent", "Rent"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center justify-center rounded-lg border border-zinc-300 py-2 text-sm has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-800"
            >
              <input
                type="radio"
                name="listing"
                value={value}
                defaultChecked={(f.listing || "sale") === value}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <Dropdown name="locality" label="Locality" defaultValue={f.locality ?? ""} options={[{ value: "", label: "Any locality" }, ...localities.map((l) => ({ value: l, label: l }))]} searchable={localities.length > 6} searchPlaceholder="Type a locality…" />
      <Dropdown name="type" label="Property type" defaultValue={f.type ?? ""} options={[{ value: "", label: "Any type" }, ...PROPERTY_TYPES.map((t) => ({ value: t.value as string, label: t.label })), ...typeGroup]} />
      <Dropdown name="budget" label="Budget" defaultValue={f.budget ?? ""} options={[{ value: "", label: "Any budget" }, ...budgets]} />
      <Dropdown name="bhk" label="Bedrooms" defaultValue={f.bhk ?? ""} options={[{ value: "", label: "Any" }, ...BHK_OPTIONS.map((n) => ({ value: String(n), label: n === 5 ? "5+ BHK" : `${n} BHK` }))]} />
      <Dropdown name="furnishing" label="Furnishing" defaultValue={f.furnishing ?? ""} options={[{ value: "", label: "Any" }, ...FURNISHING.map((x) => ({ value: x.value as string, label: x.label }))]} />
      {f.sort && <input type="hidden" name="sort" value={f.sort} />}
      <div className="flex gap-2">
        <button className="btn-primary flex-1">Apply filters</button>
        <Link href="/properties" className="btn-secondary">
          Reset
        </Link>
      </div>
    </form>
  );
}
