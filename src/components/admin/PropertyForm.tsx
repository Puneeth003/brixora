"use client";

import { useActionState, useState } from "react";
import { savePropertyEdits } from "@/app/admin/actions";
import { Dropdown } from "@/components/Dropdown";
import { AMENITIES, FURNISHING, PROPERTY_TYPES } from "@/lib/constants";
import type { Builder, Project, Property } from "@/lib/types";

export function PropertyForm({ p, builders, projects }: { p: Property; builders: Builder[]; projects: Project[] }) {
  const [state, action, pending] = useActionState(savePropertyEdits, null);
  const [builderId, setBuilderId] = useState(p.builder_id ?? "");
  const amenityOptions = Array.from(new Set([...AMENITIES, ...p.amenities]));
  const builderProjects = projects.filter((pr) => !builderId || pr.builder_id === builderId);

  return (
    <form action={action} className="card p-6">
      <input type="hidden" name="id" value={p.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Listing details</h2>
          <p className="text-xs text-[var(--s-muted)]">Edits are saved to the listing; approval is separate.</p>
        </div>
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
      {state && (
        <p
          className={`mt-4 rounded-xl px-3 py-2 text-sm font-medium ${state.ok ? "bg-[var(--s-brand-soft)] text-brand-700" : "bg-red-50 text-[var(--s-late)]"}`}
        >
          {state.ok ? state.message : state.error}
        </p>
      )}

      <div className="mt-6 space-y-7">
        <Group legend="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Listing type">
              <Dropdown
                name="listing_type"
                label="Listing type"
                variant="field"
                defaultValue={p.listing_type}
                options={[
                  { value: "sale", label: "Sale" },
                  { value: "rent", label: "Rent" },
                ]}
              />
            </F>
            <F label="Property type">
              <Dropdown
                name="property_type"
                label="Property type"
                variant="field"
                defaultValue={p.property_type}
                options={PROPERTY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
            </F>
          </div>
          <F label="Title (public)">
            <input name="title" defaultValue={p.title} className="input" maxLength={120} required />
          </F>
          <F label="Description (public)">
            <textarea name="description" defaultValue={p.description ?? ""} rows={7} className="input" maxLength={4000} />
          </F>
        </Group>

        <Group legend="Price & availability">
          <div className="grid gap-4 sm:grid-cols-3">
            <F label="Price (₹)">
              <input name="price" defaultValue={p.price} inputMode="numeric" className="input" required />
            </F>
            <label className="flex h-[42px] cursor-pointer items-center gap-2 self-end rounded-[14px] border border-[var(--s-border-strong)] px-3 text-sm font-semibold transition-colors has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--s-brand-soft)]">
              <input type="checkbox" name="price_negotiable" defaultChecked={p.price_negotiable} className="size-4 accent-brand-600" />
              Negotiable
            </label>
            <F label="Available from">
              <input type="date" name="available_from" defaultValue={p.available_from ?? ""} className="input" />
            </F>
          </div>
        </Group>

        <Group legend="Location">
          <div className="grid gap-4 sm:grid-cols-2">
            <F label="Locality (public)">
              <input name="locality" defaultValue={p.locality} className="input" required />
            </F>
            <F label="City (public)">
              <input name="city" defaultValue={p.city} className="input" required />
            </F>
          </div>
          <div className="grid gap-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200/70 sm:grid-cols-2">
            <F label="Private address (admin only)">
              <textarea name="private_address" defaultValue={p.private_address ?? ""} rows={2} className="input" />
            </F>
            <F label="Private landmark (admin only)">
              <textarea name="private_landmark" defaultValue={p.private_landmark ?? ""} rows={2} className="input" />
            </F>
          </div>
        </Group>

        <Group legend="Specifications">
          <div className="grid gap-4 sm:grid-cols-3">
            <F label="Bedrooms">
              <input name="bedrooms" defaultValue={p.bedrooms ?? ""} inputMode="numeric" className="input" />
            </F>
            <F label="Bathrooms">
              <input name="bathrooms" defaultValue={p.bathrooms ?? ""} inputMode="numeric" className="input" />
            </F>
            <F label="Area (sq.ft)">
              <input name="area_sqft" defaultValue={p.area_sqft ?? ""} inputMode="numeric" className="input" />
            </F>
            <F label="Furnishing">
              <Dropdown
                name="furnishing"
                label="Furnishing"
                variant="field"
                defaultValue={p.furnishing ?? ""}
                options={[{ value: "", label: "—" }, ...FURNISHING]}
              />
            </F>
            <F label="Floor">
              <input name="floor" defaultValue={p.floor ?? ""} className="input" />
            </F>
            <F label="Property age">
              <input name="property_age" defaultValue={p.property_age ?? ""} className="input" />
            </F>
          </div>
        </Group>

        <Group legend="Amenities">
          <div className="flex flex-wrap gap-2">
            {amenityOptions.map((a) => (
              <label
                key={a}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--s-border-strong)] bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[var(--s-hover)] has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--s-brand-soft)] has-[:checked]:text-brand-800"
              >
                <input type="checkbox" name="amenities" value={a} defaultChecked={p.amenities.includes(a)} className="accent-brand-600" />
                {a}
              </label>
            ))}
          </div>
        </Group>

        <Group legend="Builder & project">
          <div className="grid gap-4 sm:grid-cols-3">
            <F label="Builder">
              <Dropdown
                name="builder_id"
                label="Builder"
                variant="field"
                value={builderId}
                onChange={setBuilderId}
                searchable={builders.length > 8}
                options={[{ value: "", label: "—" }, ...builders.map((b) => ({ value: b.id, label: b.name }))]}
              />
            </F>
            <F label="Project">
              <Dropdown
                key={builderId}
                name="project_id"
                label="Project"
                variant="field"
                defaultValue={builderProjects.some((pr) => pr.id === p.project_id) ? (p.project_id ?? "") : ""}
                searchable={builderProjects.length > 8}
                options={[{ value: "", label: "—" }, ...builderProjects.map((pr) => ({ value: pr.id, label: pr.name }))]}
              />
            </F>
            <F label="RERA no.">
              <input name="rera_no" defaultValue={p.rera_no ?? ""} className="input" />
            </F>
          </div>
        </Group>

        <Group legend="Internal">
          <F label="Internal notes (admin only)">
            <textarea name="internal_notes" defaultValue={p.internal_notes ?? ""} rows={3} className="input" />
          </F>
        </Group>
      </div>

      <div className="mt-6 flex justify-end border-t border-[var(--s-border)] pt-5">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="mb-3 flex w-full items-center gap-3 text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase after:h-px after:flex-1 after:bg-[var(--s-border)]">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
