"use client";

import { useState } from "react";
import { BHK_OPTIONS, PROPERTY_TYPES, RENT_BUDGETS, SALE_BUDGETS } from "@/lib/constants";
import { ArrowRightIcon, BuildingIcon, HomeIcon, KeyIcon, MapPinIcon, SearchIcon, TagIcon } from "@/components/icons";
import { Dropdown } from "@/components/Dropdown";

type Tab = "sale" | "rent" | "commercial" | "sell";

const COMMERCIAL = PROPERTY_TYPES.filter((t) => !t.residential && t.value !== "plot");
const RESIDENTIAL = PROPERTY_TYPES.filter((t) => t.residential || t.value === "plot");

const COMMERCIAL_BUDGETS = [
  { value: "0-50000", label: "Rent under ₹50k" },
  { value: "50000-200000", label: "Rent ₹50k – 2 L" },
  { value: "200000-20000000", label: "₹2 L – 2 Cr" },
  { value: "20000000-", label: "Above ₹2 Cr" },
];

// Sell sits last, highlighted in gold; Buy is selected on load.
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "sale", label: "Buy", icon: <HomeIcon /> },
  { key: "rent", label: "Rent", icon: <KeyIcon /> },
  { key: "commercial", label: "Commercial", icon: <BuildingIcon /> },
  { key: "sell", label: "Sell", icon: <TagIcon /> },
];

export function HeroSearch({ localities }: { localities: string[] }) {
  const [tab, setTab] = useState<Tab>("sale");

  return (
    <div className="relative w-full max-w-[1100px]">
      <div className="inline-flex items-center rounded-t-xl bg-white/95 p-1.5 pb-0 backdrop-blur">
        {TABS.map(({ key, label, icon }, i) => {
          const active = tab === key;
          const sell = key === "sell";
          return (
            <div key={key} className="flex items-center pb-1.5">
              {i > 0 && !active && TABS[i - 1].key !== tab && <span className="h-5 w-px bg-zinc-200" />}
              <button
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:px-6 ${
                  active
                    ? sell
                      ? "bg-gradient-to-b from-gold-400 to-gold-600 text-white shadow-md shadow-gold-600/30"
                      : "bg-gradient-to-b from-brand-600 to-brand-800 text-white shadow-md shadow-brand-900/25"
                    : sell
                      ? "text-gold-600 hover:bg-gold-300/20"
                      : "text-zinc-700 hover:text-brand-700"
                }`}
              >
                {icon}
                {label}
              </button>
            </div>
          );
        })}
      </div>

      {tab === "sell" ? <SellForm /> : <SearchForm tab={tab} localities={localities} />}
    </div>
  );
}

const formCls =
  "grid gap-2.5 rounded-xl rounded-tl-none bg-white/95 p-3 shadow-xl shadow-black/15 backdrop-blur sm:grid-cols-2 lg:grid-cols-[1.15fr_1fr_1fr_1fr_auto] lg:gap-3";

function SearchForm({ tab, localities }: { tab: Exclude<Tab, "sell">; localities: string[] }) {
  const types = tab === "commercial" ? COMMERCIAL : RESIDENTIAL;
  const budgets = tab === "rent" ? RENT_BUDGETS : tab === "commercial" ? COMMERCIAL_BUDGETS : SALE_BUDGETS;
  // Commercial "All types" searches every commercial type at once.
  const allTypes = tab === "commercial" ? COMMERCIAL.map((t) => t.value).join(",") : "";

  return (
    <form action="/properties" method="get" className={formCls}>
      {tab !== "commercial" && <input type="hidden" name="listing" value={tab} />}
      <Dropdown
        name="locality"
        label="Location"
        searchable={localities.length > 6}
        searchPlaceholder="Type a locality…"
        icon={<MapPinIcon className="text-zinc-400" />}
        options={[{ value: "", label: "All localities" }, ...localities.map((l) => ({ value: l, label: l }))]}
      />
      <Dropdown
        key={`type-${tab}`}
        name="type"
        label="Property Type"
        defaultValue={allTypes}
        options={[{ value: allTypes, label: "All types" }, ...types.map((t) => ({ value: t.value, label: t.label }))]}
      />
      <Dropdown key={`budget-${tab}`} name="budget" label="Price Range" options={[{ value: "", label: "Any budget" }, ...budgets]} />
      <Dropdown
        key={`bhk-${tab}`}
        name="bhk"
        label="Bedrooms"
        disabled={tab === "commercial"}
        options={[
          { value: "", label: tab === "commercial" ? "Not applicable" : "Any" },
          ...BHK_OPTIONS.map((n) => ({ value: String(n), label: n === 5 ? "5+ BHK" : `${n} BHK` })),
        ]}
      />
      <button className="btn h-full min-h-11 bg-gradient-to-b from-brand-600 to-brand-800 px-7 text-base font-semibold text-white shadow-lg shadow-brand-900/25 hover:from-brand-700 hover:to-brand-900 sm:col-span-2 lg:col-span-1">
        <SearchIcon />
        Search
      </button>
    </form>
  );
}

/** Quick start for owners: the answers prefill the /post wizard. */
function SellForm() {
  return (
    <form action="/post" method="get" className={formCls}>
      <Dropdown
        name="listing_type"
        label="I want to"
        defaultValue="sale"
        options={[
          { value: "sale", label: "Sell my property" },
          { value: "rent", label: "Rent it out" },
        ]}
      />
      <Dropdown
        name="property_type"
        label="Property Type"
        defaultValue="apartment"
        options={PROPERTY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
      />
      <TextField name="locality" label="Locality" placeholder="e.g. Kadri" icon={<MapPinIcon className="text-zinc-400" />} />
      <TextField name="price" label="Expected price (₹)" placeholder="e.g. 7500000" inputMode="numeric" />
      <button className="btn h-full min-h-11 bg-gradient-to-b from-gold-400 to-gold-600 px-6 text-base font-semibold text-white shadow-lg shadow-gold-600/30 hover:from-gold-500 hover:to-gold-600 sm:col-span-2 lg:col-span-1">
        List Property
        <ArrowRightIcon />
      </button>
    </form>
  );
}

function TextField({
  name,
  label,
  placeholder,
  icon,
  inputMode,
}: {
  name: string;
  label: string;
  placeholder: string;
  icon?: React.ReactNode;
  inputMode?: "numeric";
}) {
  return (
    <label className="flex cursor-text items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15 hover:border-zinc-300">
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-zinc-500">{label}</span>
        <input
          name={name}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={80}
          className="block w-full bg-transparent text-sm font-medium text-zinc-900 outline-none placeholder:font-normal placeholder:text-zinc-400"
        />
      </span>
      {icon}
    </label>
  );
}
