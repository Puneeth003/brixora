"use client";

import { useActionState } from "react";
import { saveBuilder, saveProject } from "@/app/admin/actions";
import type { Builder, Project } from "@/lib/types";

function Status({ state }: { state: { ok: boolean; error?: string; message?: string } | null }) {
  if (!state) return null;
  return (
    <p className={`text-sm font-medium ${state.ok ? "text-brand-700" : "text-[var(--s-late)]"}`}>{state.ok ? state.message : state.error}</p>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-bold tracking-wider text-[var(--s-muted)] uppercase">{label}</span>
      {children}
    </label>
  );
}

export function BuilderForm({ builder }: { builder?: Builder }) {
  const [state, action, pending] = useActionState(saveBuilder, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {builder && <input type="hidden" name="id" value={builder.id} />}
      <Field label="Name">
        <input name="name" defaultValue={builder?.name} placeholder="Builder name" required className="input" />
      </Field>
      <Field label="RERA">
        <input name="rera_no" defaultValue={builder?.rera_no ?? ""} placeholder="RERA no." className="input" />
      </Field>
      <Field label="Contact">
        <input name="contact_name" defaultValue={builder?.contact_name ?? ""} placeholder="Contact person" className="input" />
      </Field>
      <Field label="Phone">
        <input name="phone" defaultValue={builder?.phone ?? ""} placeholder="Phone" className="input" />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <textarea name="notes" defaultValue={builder?.notes ?? ""} placeholder="Notes (admin only)" rows={2} className="input" />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : builder ? "Save builder" : "Add builder"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function ProjectForm({ project, builders }: { project?: Project; builders: Builder[] }) {
  const [state, action, pending] = useActionState(saveProject, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {project && <input type="hidden" name="id" value={project.id} />}
      <Field label="Name">
        <input name="name" defaultValue={project?.name} placeholder="Project name" required className="input" />
      </Field>
      <Field label="Builder">
        <select name="builder_id" defaultValue={project?.builder_id ?? ""} required className="input">
          <option value="" disabled>
            Builder…
          </option>
          {builders.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Locality">
        <input name="locality" defaultValue={project?.locality ?? ""} placeholder="Locality" className="input" />
      </Field>
      <Field label="RERA">
        <input name="rera_no" defaultValue={project?.rera_no ?? ""} placeholder="RERA project no." className="input" />
      </Field>
      <Field label="Status">
        <select name="status" defaultValue={project?.status ?? "under_construction"} className="input">
          <option value="upcoming">Upcoming</option>
          <option value="under_construction">Under construction</option>
          <option value="ready">Ready to move</option>
        </select>
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending || !builders.length}>
          {pending ? "Saving…" : project ? "Save project" : "Add project"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}
