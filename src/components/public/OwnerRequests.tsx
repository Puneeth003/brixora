"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { requestPriceChange, requestSold, startDetailsRequest, submitDetailsRequest, uploadChangePhoto } from "@/app/(site)/manage/actions";
import { compressImage } from "@/lib/compress";
import { PHOTO_LIMITS } from "@/lib/constants";

type Tab = "price" | "details" | "sold";

export function OwnerRequests({
  property,
  images,
  blocked,
}: {
  property: { id: string; price: number; price_negotiable: boolean; description: string; available_from: string | null; listing_type: string };
  images: { id: string; url: string; is_visible: boolean }[];
  blocked: Record<Tab, boolean>;
}) {
  const [tab, setTab] = useState<Tab>("price");
  const tabs: [Tab, string][] = [
    ["price", "Change price"],
    ["details", "Update details"],
    ["sold", "Mark as sold"],
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex border-b border-zinc-200">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-3 text-sm font-medium ${
              tab === t ? "border-b-2 border-brand-600 text-brand-800" : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="p-5">
        {blocked[tab] ? (
          <p className="text-sm text-zinc-600">
            You already have a pending request of this type. We&apos;ll message you on WhatsApp once it&apos;s reviewed.
          </p>
        ) : tab === "price" ? (
          <PriceForm property={property} />
        ) : tab === "details" ? (
          <DetailsForm property={property} images={images} />
        ) : (
          <SoldForm propertyId={property.id} />
        )}
      </div>
    </div>
  );
}

function Done({ message }: { message?: string }) {
  return <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">{message}</div>;
}

function PriceForm({ property }: { property: { id: string; price: number; price_negotiable: boolean; listing_type: string } }) {
  const [state, action, pending] = useActionState(requestPriceChange, null);
  if (state?.ok) return <Done message={state.message} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="propertyId" value={property.id} />
      <div>
        <label className="label" htmlFor="new-price">
          New {property.listing_type === "rent" ? "monthly rent" : "price"} (₹)
        </label>
        <input id="new-price" name="price" inputMode="numeric" required className="input" defaultValue={property.price} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="price_negotiable" defaultChecked={property.price_negotiable} className="size-4 accent-brand-600" />
        Price is negotiable
      </label>
      <div>
        <label className="label" htmlFor="price-note">
          Note for our team <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <input id="price-note" name="note" maxLength={500} className="input" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Request price change"}
      </button>
      <p className="text-xs text-zinc-500">The current price stays live until our team approves the change.</p>
    </form>
  );
}

function DetailsForm({
  property,
  images,
}: {
  property: { id: string; description: string; available_from: string | null };
  images: { id: string; url: string; is_visible: boolean }[];
}) {
  const router = useRouter();
  const [description, setDescription] = useState(property.description);
  const [availableFrom, setAvailableFrom] = useState(property.available_from ?? "");
  const [note, setNote] = useState("");
  const [hide, setHide] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const start = await startDetailsRequest({
        propertyId: property.id,
        description: description === property.description ? "" : description,
        available_from: availableFrom,
        hide_image_ids: hide,
        note,
      });
      if (!start.ok) throw new Error(start.error);
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${files.length}…`);
        const fd = new FormData();
        fd.set("requestId", start.id);
        fd.set("file", await compressImage(files[i]));
        const res = await uploadChangePhoto(fd);
        if (!res.ok) throw new Error(res.error);
      }
      const fin = await submitDetailsRequest(start.id);
      if (!fin.ok) throw new Error(fin.error);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  if (done) return <Done message="Update requested. We'll review it and confirm on WhatsApp." />;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="d-desc">
          Description
        </label>
        <textarea id="d-desc" rows={5} maxLength={4000} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="d-avail">
          Available from
        </label>
        <input id="d-avail" type="date" className="input sm:w-56" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} />
      </div>
      {images.length > 0 && (
        <div>
          <span className="label">Remove photos</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {images
              .filter((i) => i.is_visible)
              .map((img) => {
                const on = hide.includes(img.id);
                return (
                  <button
                    type="button"
                    key={img.id}
                    onClick={() => setHide((h) => (on ? h.filter((x) => x !== img.id) : [...h, img.id]))}
                    className={`relative aspect-square overflow-hidden rounded-lg ring-2 ${on ? "ring-red-500" : "ring-transparent"}`}
                  >
                    <Image src={img.url} alt="" fill sizes="120px" className={`object-cover ${on ? "opacity-40" : ""}`} />
                    {on && <span className="absolute inset-0 grid place-items-center text-xs font-semibold text-red-700">Remove</span>}
                  </button>
                );
              })}
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor="d-photos">
          Add photos
        </label>
        <input
          id="d-photos"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, PHOTO_LIMITS.max))}
          className="block text-sm"
        />
        {files.length > 0 && <p className="mt-1 text-xs text-zinc-500">{files.length} photo(s) selected</p>}
      </div>
      <div>
        <label className="label" htmlFor="d-note">
          Note for our team <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <input id="d-note" maxLength={500} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {progress && <p className="text-sm text-zinc-600">{progress}</p>}
      <button className="btn-primary" disabled={busy}>
        {busy ? "Sending…" : "Request update"}
      </button>
    </form>
  );
}

function SoldForm({ propertyId }: { propertyId: string }) {
  const [state, action, pending] = useActionState(requestSold, null);
  if (state?.ok) return <Done message={state.message} />;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="propertyId" value={propertyId} />
      <p className="text-sm text-zinc-600">
        Sold or rented out? The listing will be hidden from the website straight away and our team will confirm.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="size-4 accent-brand-600" />
        Yes, this property is sold / no longer available
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-danger" disabled={pending}>
        {pending ? "Sending…" : "Mark as sold"}
      </button>
    </form>
  );
}
