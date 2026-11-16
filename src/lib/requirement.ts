// "Tell us what you need": a buyer's or tenant's requirement, posted from the public site
// into the CRM. This file checks what was posted and words it for the client's timeline.
// No imports here: the tests load this file directly.

export const MAX_REQUIREMENT_LOCALITIES = 5;
export const MAX_REQUIREMENT_TYPES = 4;

export type RequirementForm = {
  looking: string; // "sale" (buy) or "rent"
  types: string[];
  localities: string[];
  bhk: string;
  budget: string; // "min-max" in rupees, either side may be empty
  notes: string;
};

/** What the form may contain: taken from the site's own lists, so nothing else gets through. */
export type RequirementOptions = {
  types: readonly string[];
  localities: readonly string[];
  saleBudgets: readonly string[];
  rentBudgets: readonly string[];
};

export type Requirement = {
  listing_type: "sale" | "rent";
  property_types: string[];
  /** In the site's own spelling. */
  localities: string[];
  bedrooms: number | null;
  budget_min: number | null;
  budget_max: number | null;
  notes: string | null;
};

export function parseRequirement(form: RequirementForm, options: RequirementOptions): { ok: true; value: Requirement } | { ok: false; error: string } {
  if (form.looking !== "sale" && form.looking !== "rent") return { ok: false, error: "Please choose whether you want to buy or rent." };

  const property_types = options.types.filter((t) => form.types.includes(t)).slice(0, MAX_REQUIREMENT_TYPES);

  const wanted = new Set(form.localities.map((l) => l.trim().toLowerCase()));
  const localities = options.localities.filter((l) => wanted.has(l.trim().toLowerCase())).slice(0, MAX_REQUIREMENT_LOCALITIES);

  const bhk = Number(form.bhk);
  const bedrooms = form.bhk && Number.isInteger(bhk) && bhk >= 1 && bhk <= 5 ? bhk : null;

  let budget_min: number | null = null;
  let budget_max: number | null = null;
  if (form.budget) {
    const offered = form.looking === "rent" ? options.rentBudgets : options.saleBudgets;
    if (!offered.includes(form.budget)) return { ok: false, error: "Please choose a budget from the list." };
    const [min, max] = form.budget.split("-").map((v) => Number(v) || null);
    budget_min = min;
    budget_max = max;
  }

  const notes = form.notes.trim().slice(0, 1000) || null;

  // An empty form tells the team nothing they could act on.
  if (!property_types.length && !localities.length && !bedrooms && !budget_min && !budget_max && !notes) {
    return { ok: false, error: "Please tell us at least one thing you are looking for." };
  }
  return { ok: true, value: { listing_type: form.looking, property_types, localities, bedrooms, budget_min, budget_max, notes } };
}

/** One readable line for the client's timeline. `label` and `money` come from the site's own formatters. */
export function requirementSummary(r: Requirement, label: (type: string) => string, money: (rupees: number) => string) {
  const parts = [r.listing_type === "rent" ? "To rent" : "To buy"];
  if (r.property_types.length) parts.push(r.property_types.map(label).join(", "));
  if (r.bedrooms) parts.push(r.bedrooms >= 5 ? "5+ BHK" : `${r.bedrooms} BHK`);
  if (r.localities.length) parts.push(`in ${r.localities.join(", ")}`);
  const per = r.listing_type === "rent" ? " a month" : "";
  if (r.budget_min && r.budget_max) parts.push(`budget ${money(r.budget_min)} to ${money(r.budget_max)}${per}`);
  else if (r.budget_max) parts.push(`budget up to ${money(r.budget_max)}${per}`);
  else if (r.budget_min) parts.push(`budget from ${money(r.budget_min)}${per}`);
  const line = `Requirement posted on the website: ${parts.join(" · ")}.`;
  return r.notes ? `${line}\n${r.notes}` : line;
}
