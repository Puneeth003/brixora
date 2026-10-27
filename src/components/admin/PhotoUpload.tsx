"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { uploadAdminPhoto } from "@/app/admin/actions";
import { compressImage } from "@/lib/compress";

export function PhotoUpload({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    for (let i = 0; i < list.length; i++) {
      setStatus(`Uploading ${i + 1} of ${list.length}…`);
      const fd = new FormData();
      fd.set("propertyId", propertyId);
      try {
        fd.set("file", await compressImage(list[i]));
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Upload failed");
        return;
      }
      const res = await uploadAdminPhoto(fd);
      if (!res.ok) {
        setStatus(res.error ?? "Upload failed");
        return;
      }
    }
    setStatus(null);
    router.refresh();
  }

  return (
    <label className="group grid aspect-[4/3] cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-[var(--s-border-strong)] bg-[var(--s-bg)] p-3 text-center text-sm text-[var(--s-muted)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--s-brand-soft)] hover:text-[var(--brand)]">
      <span className="flex flex-col items-center gap-2">
        <span className="grid size-10 place-items-center rounded-full bg-white text-xl leading-none font-bold shadow-sm group-hover:text-[var(--brand)]" aria-hidden>
          +
        </span>
        <span className="font-semibold">{status ?? "Upload photos"}</span>
        {!status && <span className="text-xs">Select one or more images</span>}
      </span>
      <input
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
