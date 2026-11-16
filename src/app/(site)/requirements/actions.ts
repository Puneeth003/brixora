"use server";

import { z } from "zod";
import { recordAttempt, tooManyAttempts } from "@/lib/auth";
import { PROPERTY_TYPES, RENT_BUDGETS, SALE_BUDGETS, propertyTypeLabel } from "@/lib/constants";
import { recordRequirementInCrm } from "@/lib/crm";
import { dbConfigured } from "@/lib/db";
import { formatPrice, normalizeIndianPhone } from "@/lib/format";
import { getLocalities } from "@/lib/queries";
import { parseRequirement, requirementSummary } from "@/lib/requirement";
import type { ActionState } from "@/lib/types";

const contact = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  phone: z.string().trim().min(10, "Please enter a valid mobile number").max(20),
});

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
const list = (values: FormDataEntryValue[]) => values.filter((v): v is string => typeof v === "string").slice(0, 60);

/** A buyer or tenant tells us what they are looking for; it becomes (or updates) a CRM client. */
export async function submitRequirement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Honeypot: real users never fill this hidden field.
  if (formData.get("website")) return { ok: true, message: "Thanks! We'll be in touch shortly." };

  const who = contact.safeParse({ name: formData.get("name"), phone: formData.get("phone") });
  if (!who.success) return { ok: false, error: who.error.issues[0].message };
  const phone = normalizeIndianPhone(who.data.phone);
  if (!phone) return { ok: false, error: "Please enter a valid 10-digit Indian mobile number." };

  const localities = await getLocalities();
  const parsed = parseRequirement(
    {
      looking: text(formData.get("looking")),
      types: list(formData.getAll("type")),
      localities: list(formData.getAll("locality")),
      bhk: text(formData.get("bhk")),
      budget: text(formData.get("budget")),
      notes: text(formData.get("notes")),
    },
    {
      types: PROPERTY_TYPES.map((t) => t.value as string),
      localities: localities.map((l) => l.locality),
      saleBudgets: SALE_BUDGETS.map((b) => b.value),
      rentBudgets: RENT_BUDGETS.map((b) => b.value),
    },
  );
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const r = parsed.value;

  if (!dbConfigured) return { ok: false, error: "This form isn't connected on this copy of the site. Please call us." };

  try {
    // Spam guard, shared with listing enquiries: a few per number per hour.
    if (await tooManyAttempts("enquiry", phone, 5, 60, { countSuccess: true })) {
      return { ok: false, error: "You've sent several requests already. We'll call you shortly, or please call us directly." };
    }
    await recordAttempt("enquiry", phone, true);

    await recordRequirementInCrm({
      name: who.data.name,
      phone,
      listingType: r.listing_type,
      propertyTypes: r.property_types,
      localities: r.localities,
      bedrooms: r.bedrooms,
      budgetMin: r.budget_min,
      budgetMax: r.budget_max,
      summary: requirementSummary(r, propertyTypeLabel, (n) => formatPrice(n)),
    });
  } catch (error) {
    console.error("[requirement] save failed", error);
    return { ok: false, error: "Something went wrong. Please try again or call us." };
  }

  return { ok: true, message: "Thanks! We've noted what you're looking for. Our team will call you with matching properties." };
}
