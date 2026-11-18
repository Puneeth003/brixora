"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AMENITIES, DOCUMENT_LIMITS, DOCUMENT_TYPES, FURNISHING, PHOTO_LIMITS, PROPERTY_TYPES, isResidential } from "@/lib/constants";
import { compressImage } from "@/lib/compress";
import { Dropdown } from "@/components/Dropdown";
import { PhoneOtp } from "@/components/PhoneOtp";
import { LocationPicker, type Pin } from "@/components/public/LocationPicker";
import { createDraft, finalizeSubmission, uploadDraftDocument, uploadDraftPhoto } from "@/app/(site)/post/actions";
import { clearDraft, loadDraft, loadPhotos, saveDraft, savePhotos } from "@/lib/post-draft";
import type { DocumentType } from "@/lib/types";

const STEPS = ["Type", "Location", "Details", "Photos", "Documents", "Verify", "Your name"] as const;
const S = { type: 0, location: 1, details: 2, photos: 3, documents: 4, verify: 5, name: 6 } as const;

/** Which step holds each server-validated field, to jump back when the server rejects it. */
const FIELD_STEP: Record<string, number> = {
  listing_type: S.type,
  property_type: S.type,
  city: S.location,
  locality: S.location,
  private_address: S.location,
  private_landmark: S.location,
  latitude: S.location,
  longitude: S.location,
  title: S.details,
  description: S.details,
  price: S.details,
  price_negotiable: S.details,
  bedrooms: S.details,
  bathrooms: S.details,
  area_sqft: S.details,
  furnishing: S.details,
  floor: S.details,
  property_age: S.details,
  available_from: S.details,
  amenities: S.details,
  name: S.name,
  consent: S.name,
};

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
  latitude: number | null;
  longitude: number | null;
};

type Photo = { id: string; file: File; url: string };
type Doc = { id: string; file: File; type: DocumentType };

export type PostPrefill = { listing_type?: "sale" | "rent"; property_type?: string; locality?: string; price?: string };

export function PostWizard({ defaultCity, brandName, prefill = {} }: { defaultCity: string; brandName: string; prefill?: PostPrefill }) {
  // Coming from the home page "Sell" tab: type is already chosen, so start at Location.
  const [step, setStep] = useState<number>(prefill.property_type ? S.location : S.type);
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
    latitude: null,
    longitude: null,
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docType, setDocType] = useState<DocumentType>("sale_deed");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState({ owner: false, brokerage: false });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState("");
  const [draft, setDraft] = useState<{ id: string; ref: string; uploaded: number; docsUploaded: number } | null>(null);
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
        setStep(Math.min(Math.max(d.step, 0), S.photos));
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
    saveDraft(form, Math.min(step, S.photos), name);
  }, [form, step, name, doneRef]);

  useEffect(() => {
    if (!loadedRef.current || doneRef) return;
    savePhotos(photos.map((p) => ({ id: p.id, file: p.file })));
  }, [photos, doneRef]);

  async function startOver() {
    await clearDraft();
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setDocs([]);
    setName("");
    setConsent({ owner: false, brokerage: false });
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
      latitude: null,
      longitude: null,
    }));
    setStep(S.type);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // The same limits the server applies (src/lib/validation.ts), so a submission that
  // passes here isn't rejected at the end.
  const stepError = useMemo(() => {
    if (step === S.location) {
      const city = form.city.trim().length;
      if (city < 2 || city > 60) return "Enter the city.";
      const locality = form.locality.trim().length;
      if (locality < 2) return "Enter the locality.";
      if (locality > 80) return "Locality is too long (80 characters at most).";
      const address = form.private_address.trim().length;
      if (address < 5) return "Enter the address (kept private).";
      if (address > 300) return "Address is too long (300 characters at most).";
      if (form.private_landmark.trim().length > 200) return "Landmark is too long (200 characters at most).";
      if (form.latitude === null || form.longitude === null) return "Drop a pin on the map at the property.";
    }
    if (step === S.details) {
      const title = form.title.trim().length;
      if (title < 10) return "Title should be at least 10 characters.";
      if (title > 120) return "Title is too long (120 characters at most).";
      const price = Number(form.price);
      if (!price || price < 1000) return "Enter a valid price.";
      if (price > 10_000_000_000) return "That price looks too high. Check the number of zeros.";
      if (residential && !form.bedrooms) return "Choose the number of bedrooms.";
      const area = Number(form.area_sqft);
      if (!area) return "Enter the area in sq.ft.";
      if (area < 50) return "Area looks too small (50 sq.ft at least).";
      if (area > 10_000_000) return "Area looks too large. Check the number.";
      if (form.description.trim().length < 30) return "Describe the property in at least 30 characters.";
    }
    if (step === S.photos && photos.length < PHOTO_LIMITS.min) return `Add at least ${PHOTO_LIMITS.min} photos.`;
    if (step === S.name) {
      if (name.trim().length < 2) return "Enter your name.";
      if (name.trim().length > 80) return "Name is too long.";
      if (!consent.owner || !consent.brokerage) return "Please tick both boxes to submit.";
    }
    return null;
  }, [step, form, photos.length, name, residential, consent]);

  const next = () => {
    if (stepError) return setError(stepError);
    setError(null);
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => {
    setError(null);
    // From "Your name", skip Verify: the number is already verified and the OTP step
    // would send them straight forward again.
    setStep((s) => (s === S.name ? S.documents : Math.max(0, s - 1)));
  };

  const onVerified = useCallback(() => setStep(S.name), []);
  const onPin = useCallback((pin: Pin) => setForm((f) => ({ ...f, latitude: pin.lat, longitude: pin.lng })), []);

  function addDocs(files: FileList | null) {
    if (!files) return;
    setError(null);
    const room = DOCUMENT_LIMITS.max - docs.length;
    const list = Array.from(files);
    const tooBig = list.find((f) => f.type === "application/pdf" && f.size > DOCUMENT_LIMITS.maxBytes);
    if (tooBig) setError(`${tooBig.name} is larger than ${DOCUMENT_LIMITS.maxBytes / 1024 / 1024} MB.`);
    const added = list
      .filter((f) => (f.type === "application/pdf" && f.size <= DOCUMENT_LIMITS.maxBytes) || f.type.startsWith("image/"))
      .slice(0, room)
      .map((file) => ({ id: crypto.randomUUID(), file, type: docType }));
    setDocs((d) => [...d, ...added]);
  }

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
            // Fields the chosen type doesn't show are sent empty, even if filled in earlier.
            bedrooms: residential ? form.bedrooms : "",
            bathrooms: residential ? form.bathrooms : "",
            furnishing: residential ? form.furnishing : "",
            floor: form.property_type === "plot" ? "" : form.floor,
            property_age: form.property_type === "plot" ? "" : form.property_age,
            amenities: form.property_type === "plot" ? [] : form.amenities,
          },
          name,
        );
        if (!res.ok) {
          if (res.field && res.field in FIELD_STEP) setStep(FIELD_STEP[res.field]);
          throw new Error(res.error);
        }
        current = { id: res.id, ref: res.ref, uploaded: 0, docsUploaded: 0 };
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

      for (let i = current.docsUploaded; i < docs.length; i++) {
        setProgress(`Uploading document ${i + 1} of ${docs.length}…`);
        const d = docs[i];
        const fd = new FormData();
        fd.set("propertyId", current.id);
        fd.set("docType", d.type);
        fd.set("file", d.file.type.startsWith("image/") ? await compressImage(d.file) : d.file);
        const res = await uploadDraftDocument(fd);
        if (!res.ok) {
          setStep(S.documents);
          throw new Error(`${d.file.name}: ${res.error} Remove it or try another file.`);
        }
        current = { ...current, docsUploaded: i + 1 };
        setDraft(current);
      }

      setProgress("Submitting…");
      const fin = await finalizeSubmission(current.id, consent);
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
        {step === S.type && (
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

        {step === S.location && (
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
            <Field label="Pin the property on the map" hint="Private – helps our auditor find it" required>
              <LocationPicker
                value={form.latitude !== null && form.longitude !== null ? { lat: form.latitude, lng: form.longitude } : null}
                onChange={onPin}
                searchText={[form.locality, form.city].filter((x) => x.trim()).join(", ")}
              />
            </Field>
          </>
        )}

        {step === S.details && (
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
                    <Dropdown
                      variant="field"
                      label="Bedrooms"
                      value={form.bedrooms}
                      onChange={(v) => set("bedrooms", v)}
                      options={[{ value: "", label: "—" }, ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }))]}
                    />
                  </Field>
                  <Field label="Bathrooms">
                    <Dropdown
                      variant="field"
                      label="Bathrooms"
                      value={form.bathrooms}
                      onChange={(v) => set("bathrooms", v)}
                      options={[{ value: "", label: "—" }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))]}
                    />
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
                  <Dropdown
                    variant="field"
                    label="Furnishing"
                    value={form.furnishing}
                    onChange={(v) => set("furnishing", v)}
                    options={[{ value: "", label: "—" }, ...FURNISHING]}
                  />
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

        {step === S.photos && (
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

        {step === S.documents && (
          <>
            <div>
              <p className="font-medium">
                Ownership documents <span className="font-normal text-zinc-500">(optional, {docs.length}/{DOCUMENT_LIMITS.max})</span>
              </p>
              <p className="text-sm text-zinc-500">
                Sale deed, khata, RTC, tax receipt and so on. They speed up the verification. Only our team and the auditor see
                them; they are never shown on the website. PDF or a clear photo, up to {DOCUMENT_LIMITS.maxBytes / 1024 / 1024} MB each.
                You can also add them later from My listings.
              </p>
            </div>
            {docs.length > 0 && (
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                {docs.map((d, i) => {
                  const uploaded = draft !== null && i < draft.docsUploaded;
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block font-medium">{DOCUMENT_TYPES.find((t) => t.value === d.type)?.label}</span>
                        <span className="block truncate text-zinc-500">{d.file.name}</span>
                      </span>
                      {uploaded ? (
                        <span className="shrink-0 text-xs font-semibold text-brand-700">Uploaded</span>
                      ) : (
                        <button type="button" onClick={() => setDocs((ds) => ds.filter((x) => x.id !== d.id))} className="shrink-0 text-red-600 hover:underline">
                          Remove
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {docs.length < DOCUMENT_LIMITS.max && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <label className="label" htmlFor="doc-type">
                    Document type
                  </label>
                  <Dropdown
                    id="doc-type"
                    variant="field"
                    label="Document type"
                    value={docType}
                    onChange={(v) => setDocType(v as DocumentType)}
                    options={DOCUMENT_TYPES}
                  />
                </div>
                <label className="btn-secondary cursor-pointer">
                  Add file
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addDocs(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
            {docs.length === 0 && <p className="text-sm text-zinc-500">No documents? Tap Continue; our auditor can check them at the visit.</p>}
          </>
        )}

        {step === S.verify && (
          <PhoneOtp
            onVerified={onVerified}
            intro="Verify your WhatsApp number. We'll send updates about this listing here. Your number is never shown publicly."
          />
        )}

        {step === S.name && (
          <>
            <Field label="Your name" required>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
            </Field>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={consent.owner}
                  onChange={(e) => setConsent((c) => ({ ...c, owner: e.target.checked }))}
                  className="mt-0.5 size-4 shrink-0 accent-brand-600"
                />
                <span>I am the owner of this property, or I have the owner&apos;s permission to list it.</span>
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={consent.brokerage}
                  onChange={(e) => setConsent((c) => ({ ...c, brokerage: e.target.checked }))}
                  className="mt-0.5 size-4 shrink-0 accent-brand-600"
                />
                <span>
                  I agree that {brandName} lists this property for me and handles every buyer or tenant enquiry. My number and address
                  are not shared with them.
                </span>
              </label>
            </div>
            <p className="text-sm text-zinc-500">
              By submitting you agree that {brandName} may contact you on WhatsApp about this listing. See our{" "}
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
          {step > 0 ? (
            <button type="button" onClick={back} className="btn-secondary" disabled={submitting}>
              Back
            </button>
          ) : (
            <span />
          )}
          {step < S.verify && (
            <button type="button" onClick={next} className="btn-primary">
              {step === S.documents && docs.length === 0 ? "Skip" : "Continue"}
            </button>
          )}
          {step === S.name && (
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
