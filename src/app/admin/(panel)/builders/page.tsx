import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { displayPhone } from "@/lib/format";
import { PageHeader } from "@/components/admin/ui";
import { BuilderForm, ProjectForm } from "@/components/admin/BuilderForms";
import type { Builder, Project } from "@/lib/types";
import { deleteBuilder, deleteProject } from "../../actions";

export const metadata: Metadata = { title: "Builders & projects" };

const PROJECT_STATUS = { upcoming: "Upcoming", under_construction: "Under construction", ready: "Ready to move" };

export default async function BuildersPage() {
  await requireAdmin();
  const [builders, projects, linked] = await Promise.all([
    db.all<Builder>("SELECT * FROM builders ORDER BY name"),
    db.all<Project>("SELECT * FROM projects ORDER BY name"),
    db.all<{ project_id: string; n: number }>(
      "SELECT project_id, COUNT(*) AS n FROM properties WHERE project_id IS NOT NULL GROUP BY project_id",
    ),
  ]);
  const listingCount = new Map(linked.map((l) => [l.project_id, l.n]));

  const initials = (name: string) =>
    name
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
  const statusTone = { upcoming: "bg-sky-100 text-sky-800", under_construction: "bg-amber-100 text-amber-800", ready: "bg-emerald-100 text-emerald-800" };
  const chevron = (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--s-seg)] text-[var(--s-text-2)] transition-transform group-open:rotate-180"
      aria-hidden
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
        <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );

  return (
    <>
      <PageHeader title="Builders & projects" description="Link listings to a project from the property editor." />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            Builders
            <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{builders.length}</span>
          </h2>
          <div className="card p-0">
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--s-brand-soft)] text-lg font-bold text-[var(--brand)]">+</span>
              <span className="font-bold">Add builder</span>
            </div>
            <div className="border-t border-[var(--s-border)] px-5 py-5">
              <BuilderForm />
            </div>
          </div>
          {builders.map((builder) => (
            <details key={builder.id} className="card group p-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-xs font-extrabold text-violet-800">
                    {initials(builder.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{builder.name}</span>
                    <span className="block truncate text-xs text-[var(--s-muted)]">
                      {builder.rera_no ?? "No RERA"} · {builder.contact_name ?? "—"} · {builder.phone ? displayPhone(builder.phone) : "—"}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-700 group-open:hidden">Edit</span>
                  {chevron}
                </span>
              </summary>
              <div className="space-y-4 border-t border-[var(--s-border)] px-5 py-5">
                <BuilderForm builder={builder} />
                <form action={deleteBuilder.bind(null, builder.id)} className="border-t border-[var(--s-border)] pt-4">
                  <button className="text-sm font-semibold text-[var(--s-late)] hover:underline">Delete builder (and its projects)</button>
                </form>
              </div>
            </details>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            Projects
            <span className="rounded-lg bg-[var(--s-seg)] px-2 py-0.5 text-xs font-bold">{projects.length}</span>
          </h2>
          <div className="card p-0">
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--s-brand-soft)] text-lg font-bold text-[var(--brand)]">+</span>
              <span className="font-bold">Add project</span>
            </div>
            <div className="border-t border-[var(--s-border)] px-5 py-5">
              {builders.length ? <ProjectForm builders={builders} /> : <p className="text-sm text-[var(--s-muted)]">Add a builder first.</p>}
            </div>
          </div>
          {projects.map((project) => (
            <details key={project.id} className="card group p-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-xs font-extrabold text-sky-800">
                    {initials(project.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-bold">{project.name}</span>
                      <span className={`badge ${statusTone[project.status]}`}>{PROJECT_STATUS[project.status]}</span>
                    </span>
                    <span className="block truncate text-xs text-[var(--s-muted)]">
                      {builders.find((x) => x.id === project.builder_id)?.name} · {project.locality ?? "—"} · {listingCount.get(project.id) ?? 0} listings
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-700 group-open:hidden">Edit</span>
                  {chevron}
                </span>
              </summary>
              <div className="space-y-4 border-t border-[var(--s-border)] px-5 py-5">
                <ProjectForm project={project} builders={builders} />
                <form action={deleteProject.bind(null, project.id)} className="border-t border-[var(--s-border)] pt-4">
                  <button className="text-sm font-semibold text-[var(--s-late)] hover:underline">Delete project</button>
                </form>
              </div>
            </details>
          ))}
        </section>
      </div>
    </>
  );
}
