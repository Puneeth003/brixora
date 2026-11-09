"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AMENITIES, FURNISHING, PHOTO_LIMITS, PROPERTY_TYPES, isResidential } from "@/lib/constants";
import { compressImage } from "@/lib/compress";
import { PhoneOtp } from "@/components/PhoneOtp";
import { site } from "@/lib/site";
import { createDraft, finalizeSubmission, uploadDraftPhoto } from "@/app/(site)/post/actions";
import { clearDraft, loadDraft, loadPhotos, saveDraft, savePhotos } from "@/lib/post-draft";

const STEPS = ["Type", "Location", "Details", "Photos", "Verify", "Your name"] as const;

type Form = {
  listing_type: "sale" | "rent";
  property_type: string;
  city: string;
  locality: string;
  private_address: string;
  private_landmark: string;
  title: string;
  description: string;
  price: string;
  price_negotiable: boolean;
  bedrooms: string;
  bathrooms: string;
  area_sqft: string;
  furnishing: string;
  floor: string;
  property_age: string;
  available_from: string;
  amenities: string[];
};

type Photo = { id: string; file: File; url: string };

export type PostPrefill = { listing_type?: "sale" | "rent"; property_type?: string; locality?: string; price?: string };

export function PostWizard({ defaultCity, prefill = {} }: { defaultCity: string; prefill?: PostPrefill }) {
  // Coming from the home page "Sell" tab: type is already chosen, so start at Location.
  const [step, setStep] = useState(prefill.property_type ? 1 : 0);
  const [form, setForm] = useState<Form>({
    listing_type: prefill.listing_type ?? "sale",
    property_type: prefill.property_type ?? "apartment",
    city: defaultCity,
    locality: prefill.locality ?? "",
    private_address: "",
    private_landmark: "",
    title: "",
    description: "",
    price: prefill.price ?? "",
    price_negotiable: false,
    bedrooms: "",
    bathrooms: "",
    area_sqft: "",
    furnishing: "",
    floor: "",
    property_age: "",
    available_from: "",
    amenities: [],
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [draft, setDraft] = useState<{ id: string; ref: string; uploaded: number } | null>(null);
  const [doneRef, setDoneRef] = useState<string | null>(null);
  // Draft persistence: nothing is written until the saved draft (if any) has been read,
  // so a fresh render can't overwrite it with empty fields.
  const [restored, setRestored] = useState(false);
  const loadedRef = useRef(false);

  const residential = isResidential(form.property_type);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  // Restore an unfinished listing from this browser (text from localStorage, photos from IndexedDB).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = loadDraft<Form>();
      const hasContent = d && (d.form.locality || d.form.title || d.form.description || d.form.price || d.form.private_address);
      if (hasContent) {
        const saved = await loadPhotos();
        if (cancelled) return;
        setForm((f) => ({ ...f, ...d.form }));
        setName(d.name || "");
        setPhotos(saved.map((x) => ({ id: x.id, file: x.file, url: URL.createObjectURL(x.file) })));
        // Never land on Verify or Your name: the OTP has to be done again anyway.
        setStep(Math.min(Math.max(d.step, 0), 3));
        setRestored(true);
      }
      loadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loadedRef.current || doneRef) return;
    saveDraft(form, Math.min(step, 3), name);
  }, [form, step, name, doneRef]);

  useEffect(() => {
    if (!loadedRef.current || doneRef) return;
    savePhotos(photos.map((p) => ({ id: p.id, file: p.file })));
  }, [photos, doneRef]);

  async function startOver() {
    await clearDraft();
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setName("");
    setError(null);
    setRestored(false);
    setForm((f) => ({
      ...f,
      locality: "",
      private_address: "",
      private_landmark: "",
      title: "",
      description: "",
      price: "",
      price_negotiable: false,
      bedrooms: "",
      bathrooms: "",
      area_sqft: "",
      furnishing: "",
      floor: "",
      property_age: "",
      available_from: "",
      amenities: [],
    }));
    setStep(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const stepError = useMemo(() => {
    if (step === 1) {
      if (form.locality.trim().length < 2) return "Enter the locality.";
      if (form.private_address.trim().length < 5) return "Enter the address (kept private).";
    }
    if (step === 2) {
      if (form.title.trim().length < 10) return "Title should be at least 10 characters.";
      if (!Number(form.price) || Number(form.price) < 1000) return "Enter a valid price.";
      if (residential && !form.bedrooms) return "Choose the number of bedrooms.";
      if (!Number(form.area_sqft)) return "Enter the area in sq.ft.";
      if (form.description.trim().length < 30) return "Describe the property in at least 30 characters.";
    }
    if (step === 3 && photos.length < PHOTO_LIMITS.min) return `Add at least ${PHOTO_LIMITS.min} photos.`;
    if (step === 5 && name.trim().length < 2) return "Enter your name.";
    return null;
  }, [step, form, photos.length, name, residential]);

  const next = () => {
    if (stepError) return setError(stepError);
    setError(null);
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const onVerified = useCallback(() => setStep(5), []);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = PHOTO_LIMITS.max - photos.length;
    const added = Array.from(files)
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))
      .slice(0, room)
      .map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    setPhotos((p) => [...p, ...added]);
  }

  function movePhoto(i: number, d: number) {
    setPhotos((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  async function submit() {
    if (stepError) return setError(stepError);
    setError(null);
    setSubmitting(true);
    try {
      let current = draft;
      if (!current) {
        setProgress("Saving details…");
        const res = await createDraft(
          {
            ...form,
            price: Number(form.price),
            bedrooms: residential ? form.bedrooms : "",
            bathrooms: residential ? form.bathrooms : "",
            furnishing: residential ? form.furnishing : "",
          },
          name,
        );
        if (!res.ok) throw new Error(res.error);
        current = { id: res.id, ref: res.ref, uploaded: 0 };
        setDraft(current);
      }

      for (let i = current.uploaded; i < photos.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        const file = await compressImage(photos[i].file);
        const fd = new FormData();
        fd.set("propertyId", current.id);
        fd.set("file", file);
        const res = await uploadDraftPhoto(fd);
        if (!res.ok) throw new Error(res.error);
        current = { ...current, uploaded: i + 1 };
        setDraft(current);
      }

      setProgress("Submitting…");
      const fin = await finalizeSubmission(current.id);
      if (!fin.ok) throw new Error(fin.error);
      setDoneRef(fin.ref);
      void clearDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
      setProgress("");
    }
  }

  if (doneRef) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-100 text-2xl text-brand-700">✓</div>
        <h2 className="mt-4 text-xl font-semibold">Thank you! Your property is submitted.</h2>
        <p className="mt-2 text-zinc-600">
          Reference number <strong className="font-mono">{doneRef}</strong>. We&apos;ve also sent it to you on WhatsApp.
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Our team will review the listing and message you once it&apos;s live, usually within 1–2 working days.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/manage" className="btn-primary">
            View my listings
          </Link>
          <Link href="/" className="btn-secondary">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {restored && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <span>We kept the listing you started earlier. Carry on where you left off.</span>
          <button type="button" onClick={startOver} className="font-semibold underline underline-offset-2 hover:no-underline">
            Start over
          </button>
        </div>
      )}
      <ol className="flex gap-1">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-brand-600" : "bg-zinc-200"}`} />
            <span className={`mt-1.5 hidden text-xs sm:block ${i === step ? "font-medium text-zinc-900" : "text-zinc-500"}`}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div className="card space-y-5 p-5 sm:p-6">
        {step === 0 && (
          <>
            <div>
              <span className="label">I want to</span>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["sale", "Sell"],
                    ["rent", "Rent out"],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set("listing_type", v)}
                    className={`rounded-lg border p-4 text-left font-medium ${
                      form.listing_type === v ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-300"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Property type</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PROPERTY_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set("property_type", t.value)}
                    className={`rounded-lg border px-3 py-3 text-sm ${
                      form.property_type === t.value ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-300"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City">
                <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="Locality / area" hint="Shown publicly" required>
                <input
                  className="input"
                  value={form.locality}
                  onChange={(e) => set("locality", e.target.value)}
                  placeholder="e.g. Kadri"
                />
              </Field>
            </div>
            <Field label="Full address" hint="Private – only our team sees this" required>
              <textarea
                className="input"
                rows={2}
                value={form.private_address}
                onChange={(e) => set("private_address", e.target.value)}
                placeholder="House name / number, street"
              />
            </Field>
            <Field label="Landmark" hint="Private, optional">
              <input
                className="input"
                value={form.private_landmark}
                onChange={(e) => set("private_landmark", e.target.value)}
              />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Listing title" required>
              <input
                className="input"
                value={form.title}
                maxLength={120}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Spacious 3 BHK apartment near Kadri Park"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={form.listing_type === "rent" ? "Monthly rent (₹)" : "Expected price (₹)"} required>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value.replace(/\D/g, ""))}
                  placeholder={form.listing_type === "rent" ? "25000" : "7500000"}
                />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.price_negotiable}
                  onChange={(e) => set("price_negotiable", e.target.checked)}
                  className="size-4 accent-brand-600"
                />
                Price is negotiable
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {residential && (
                <>
                  <Field label="Bedrooms" required>
                    <select className="input" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)}>
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Bathrooms">
                    <select className="input" value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)}>
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              <Field label={form.property_type === "plot" ? "Area (sq.ft)" : "Built-up area (sq.ft)"} required>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.area_sqft}
                  onChange={(e) => set("area_sqft", e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              {residential && (
                <Field label="Furnishing">
                  <select className="input" value={form.furnishing} onChange={(e) => set("furnishing", e.target.value)}>
                    <option value="">—</option>
                    {FURNISHING.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {form.property_type !== "plot" && (
                <>
                  <Field label="Floor">
                    <input className="input" value={form.floor} onChange={(e) => set("floor", e.target.value)} placeholder="e.g. 4 of 12" />
                  </Field>
                  <Field label="Property age">
                    <input
                      className="input"
                      value={form.property_age}
                      onChange={(e) => set("property_age", e.target.value)}
                      placeholder="e.g. 5 years / New"
                    />
                  </Field>
                </>
              )}
              <Field label="Available from">
                <input
                  type="date"
                  className="input"
                  value={form.available_from}
                  onChange={(e) => set("available_from", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Description" hint="Don't include phone numbers or exact address" required>
              <textarea
                className="input"
                rows={5}
                maxLength={4000}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Describe the property, surroundings, nearby schools, transport…"
              />
            </Field>
            {form.property_type !== "plot" && (
              <div>
                <span className="label">Amenities</span>
                <div className="flex flex-wrap gap-2">
                  {AMENITIES.map((a) => {
                    const on = form.amenities.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => set("amenities", on ? form.amenities.filter((x) => x !== a) : [...form.amenities, a])}
                        className={`rounded-full border px-3 py-1 text-sm ${
                          on ? "border-brand-600 bg-brand-50 text-brand-800" : "border-zinc-300 text-zinc-700"
                        }`}
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <p className="font-medium">
                Add photos ({photos.length}/{PHOTO_LIMITS.max})
              </p>
              <p className="text-sm text-zinc-500">
                At least {PHOTO_LIMITS.min}. The first photo is the cover. Avoid name boards, number plates or anything
                that shows contact details.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((p, i) => (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="size-full object-cover" />
                  {i === 0 && <span className="badge absolute top-2 left-2 bg-brand-600 text-white">Cover</span>}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-1">
                    <button type="button" onClick={() => movePhoto(i, -1)} className="px-2 text-white" aria-label="Move left">
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(p.url);
                        setPhotos((ps) => ps.filter((x) => x.id !== p.id));
                      }}
                      className="px-2 text-sm text-white"
                    >
                      Remove
                    </button>
                    <button type="button" onClick={() => movePhoto(i, 1)} className="px-2 text-white" aria-label="Move right">
                      →
                    </button>
                  </div>
                </div>
              ))}
              {photos.length < PHOTO_LIMITS.max && (
                <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border-2 border-dashed border-zinc-300 text-center text-sm text-zinc-500 hover:border-brand-400 hover:text-brand-700">
                  <span>
                    <span className="block text-2xl">+</span>Add photos
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </>
        )}

        {step === 4 && (
          <PhoneOtp
            onVerified={onVerified}
            intro="Verify your WhatsApp number. We'll send updates about this listing here. Your number is never shown publicly."
          />
        )}

        {step === 5 && (
          <>
            <Field label="Your name" required>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <p className="text-sm text-zinc-500">
              By submitting you agree that {site.name} may contact you on WhatsApp about this listing. See our{" "}
              <Link href="/privacy" className="underline">
                privacy policy
              </Link>
              .
            </p>
          </>
        )}

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {progress && <p className="text-sm text-zinc-600">{progress}</p>}

        <div className="flex justify-between gap-3 border-t border-zinc-100 pt-4">
          {step > 0 && step !== 5 ? (
            <button type="button" onClick={back} className="btn-secondary" disabled={submitting}>
              Back
            </button>
          ) : (
            <span />
          )}
          {step < 4 && (
            <button type="button" onClick={next} className="btn-primary">
              Continue
            </button>
          )}
          {step === 5 && (
            <button type="button" onClick={submit} className="btn-primary" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit property"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">
        {label}
        {required && (
          <span className="text-red-600" title="Required">
            {" "}
            *<span className="sr-only"> (required)</span>
          </span>
        )}{" "}
        {hint && <span className="font-normal text-zinc-400">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
