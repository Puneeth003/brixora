"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeVerification, uploadVerificationPhoto } from "@/app/admin/verification-actions";
import { compressImage } from "@/lib/compress";

type Item = { key: string; label: string; required: boolean };
type Geo = { lat: number; lng: number; accuracy: number };
type UploadRow = { id: number; name: string; status: "waiting" | "compressing" | "uploading" | "done" | "error"; error?: string };

const MAX_PHOTOS = 12;

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-extrabold tracking-tight">
        <span
          className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
            done ? "bg-[var(--brand)] text-white" : "bg-[var(--s-seg)] text-[var(--s-text-2)]"
          }`}
        >
          {done ? "✓" : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function VisitForm({
  visitId,
  checklist,
  photoCount,
  children,
}: {
  visitId: string;
  checklist: Item[];
  photoCount: number;
  /** Server-rendered thumbnails of photos already uploaded. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(completeVerification, null);

  // Step 1: location
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);

  function captureLocation() {
    if (!("geolocation" in navigator)) {
      setGeoNote("This browser can't share location. You can still complete the visit.");
      return;
    }
    setGeoBusy(true);
    setGeoNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setGeoBusy(false);
      },
      (err) => {
        setGeoBusy(false);
        setGeoNote(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Allow it in your browser settings to record where the visit happened, or continue without it."
            : "Couldn't get your location. Move to an open spot and try again, or continue without it.",
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  // Step 2: photos
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  const patch = (id: number, p: Partial<UploadRow>) => setUploads((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const room = Math.max(0, MAX_PHOTOS - photoCount);
    const rows: UploadRow[] = files.map((f, i) => ({
      id: nextId.current++,
      name: f.name || "Photo",
      status: i < room ? "waiting" : "error",
      error: i < room ? undefined : `Up to ${MAX_PHOTOS} photos per visit.`,
    }));
    setUploads((prev) => [...prev.filter((r) => r.status !== "done"), ...rows]);
    setUploading(true);
    for (let i = 0; i < files.length && i < room; i++) {
      const row = rows[i];
      try {
        patch(row.id, { status: "compressing" });
        const small = await compressImage(files[i]);
        patch(row.id, { status: "uploading" });
        const fd = new FormData();
        fd.set("id", visitId);
        fd.set("file", small);
        const res = await uploadVerificationPhoto(fd);
        patch(row.id, res.ok ? { status: "done" } : { status: "error", error: res.error ?? "Upload failed." });
      } catch (err) {
        patch(row.id, { status: "error", error: err instanceof Error ? err.message : "Upload failed." });
      }
    }
    setUploading(false);
    router.refresh();
  }

  // Step 3: checklist
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const requiredDone = checklist.filter((c) => c.required).every((c) => checked[c.key]);

  // Step 4: result
  const [result, setResult] = useState<"verified" | "issues" | null>(null);
  const [notes, setNotes] = useState("");

  // After a successful save, re-render the page from the server (shows the summary).
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const statusText: Record<UploadRow["status"], string> = {
    waiting: "Waiting…",
    compressing: "Preparing…",
    uploading: "Uploading…",
    done: "Uploaded",
    error: "Failed",
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={visitId} />
      <input type="hidden" name="latitude" value={geo ? String(geo.lat) : ""} />
      <input type="hidden" name="longitude" value={geo ? String(geo.lng) : ""} />
      <input type="hidden" name="accuracy" value={geo ? String(geo.accuracy) : ""} />

      <Step n={1} title="Location" done={!!geo}>
        <p className="mb-3 text-sm text-[var(--s-muted)]">Record where you are, once you reach the property. Optional, but it helps.</p>
        <button
          type="button"
          onClick={captureLocation}
          disabled={geoBusy}
          className={`${geo ? "btn-secondary" : "btn-primary"} flex min-h-12 w-full items-center justify-center gap-2 disabled:opacity-60`}
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          {geoBusy ? "Finding you…" : geo ? "Capture again" : "Capture my location"}
        </button>
        {geo && (
          <div className="mt-3 rounded-2xl bg-[var(--s-brand-soft)] px-4 py-3 text-sm">
            <p className="font-bold text-[var(--brand)] tabular-nums">
              {geo.lat.toFixed(6)}, {geo.lng.toFixed(6)}
            </p>
            <p className={geo.accuracy > 100 ? "text-amber-700" : "text-[var(--s-text-2)]"}>
              Accurate to about {geo.accuracy} m{geo.accuracy > 100 && " — try again outdoors for a better fix"}
            </p>
          </div>
        )}
        {geoNote && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{geoNote}</p>}
      </Step>

      <Step n={2} title="Photos" done={photoCount > 0}>
        <p className="mb-3 text-sm text-[var(--s-muted)]">
          Take photos at the property (front, rooms, any issues). At least one is needed to mark verified. {photoCount}/{MAX_PHOTOS} added.
        </p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={onFiles} className="sr-only" tabIndex={-1} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || photoCount >= MAX_PHOTOS}
          className="btn-secondary flex min-h-12 w-full items-center justify-center gap-2 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {uploading ? "Uploading…" : photoCount >= MAX_PHOTOS ? "Photo limit reached" : "Take or add photos"}
        </button>
        {uploads.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--s-hover)] px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-[var(--s-text-2)]">{u.name}</span>
                <span
                  className={`shrink-0 text-xs font-bold ${
                    u.status === "done" ? "text-[var(--brand)]" : u.status === "error" ? "text-[var(--s-late)]" : "text-[var(--s-muted)]"
                  }`}
                  title={u.error}
                >
                  {u.status === "error" && u.error ? u.error : statusText[u.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
        {children && <div className="mt-4">{children}</div>}
      </Step>

      <Step n={3} title="Checklist" done={requiredDone}>
        <div className="space-y-2">
          {checklist.map((c) => {
            const on = !!checked[c.key];
            return (
              <label
                key={c.key}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors select-none ${
                  on ? "border-[var(--brand)] bg-[var(--s-brand-soft)]" : "border-[var(--s-border)] bg-white hover:bg-[var(--s-hover)]"
                }`}
              >
                <input
                  type="checkbox"
                  name={c.key}
                  checked={on}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-extrabold ${
                    on ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--s-border-strong)] bg-white text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold text-[var(--s-text)]">{c.label}</span>
                {c.required && (
                  <span className="badge shrink-0 bg-[var(--s-seg)] text-[var(--s-text-2)]">Required</span>
                )}
              </label>
            );
          })}
        </div>
      </Step>

      <Step n={4} title="Result" done={!!result}>
        <div className="grid grid-cols-2 gap-3">
          <label
            className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-center transition-colors ${
              result === "verified" ? "border-[var(--brand)] bg-[var(--s-brand-soft)] text-[var(--brand)]" : "border-[var(--s-border)] bg-white text-[var(--s-text-2)]"
            }`}
          >
            <input type="radio" name="result" value="verified" checked={result === "verified"} onChange={() => setResult("verified")} className="sr-only" />
            <span className="text-2xl font-extrabold">✓</span>
            <span className="text-base font-extrabold">Verified</span>
          </label>
          <label
            className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-center transition-colors ${
              result === "issues" ? "border-[var(--s-late)] bg-red-50 text-[var(--s-late)]" : "border-[var(--s-border)] bg-white text-[var(--s-text-2)]"
            }`}
          >
            <input type="radio" name="result" value="issues" checked={result === "issues"} onChange={() => setResult("issues")} className="sr-only" />
            <span className="text-2xl font-extrabold">!</span>
            <span className="text-base font-extrabold">Issues found</span>
          </label>
        </div>

        {result === "verified" && (!requiredDone || photoCount === 0) && (
          <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            To mark verified, {[!requiredDone && "tick every required checklist item", photoCount === 0 && "add at least one photo"].filter(Boolean).join(" and ")}.
          </p>
        )}

        <label className="label mt-4 block" htmlFor="visit-notes">
          Notes {result === "issues" ? <span className="text-[var(--s-late)]">(required)</span> : "(optional)"}
        </label>
        <textarea
          id="visit-notes"
          name="notes"
          rows={4}
          maxLength={4000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          required={result === "issues"}
          placeholder={result === "issues" ? "What didn't match? e.g. only 2 bedrooms, photos are old…" : "Anything the admin should know"}
          className="input w-full text-base"
        />

        {state?.error && <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{state.error}</p>}
        {state?.ok && state.message && (
          <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={pending || uploading || !result}
          className={`${result === "issues" ? "btn-danger text-white" : "btn-primary"} mt-4 flex min-h-12 w-full items-center justify-center text-base disabled:opacity-60`}
        >
          {pending ? "Saving…" : result === "issues" ? "Submit with issues" : "Complete visit"}
        </button>
      </Step>
    </form>
  );
}
