"use client";

import Image from "next/image";
import { useState } from "react";

export function Gallery({ images, title }: { images: { id: string; url: string }[]; title: string }) {
  const [index, setIndex] = useState(0);

  if (!images.length) {
    return <div className="card grid aspect-[16/10] place-items-center text-zinc-400">No photos yet</div>;
  }

  const current = images[Math.min(index, images.length - 1)];
  const go = (d: number) => setIndex((i) => (i + d + images.length) % images.length);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-zinc-900">
        <Image
          key={current.id}
          src={current.url}
          alt={`${title} – photo ${index + 1}`}
          fill
          priority={index === 0}
          sizes="(min-width: 1024px) 66vw, 100vw"
          className="object-contain"
        />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-lg shadow hover:bg-white"
              aria-label="Previous photo"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-lg shadow hover:bg-white"
              aria-label="Next photo"
            >
              ›
            </button>
            <span className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIndex(i)}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 ${
                i === index ? "ring-brand-600" : "ring-transparent opacity-70 hover:opacity-100"
              }`}
              aria-label={`Show photo ${i + 1}`}
            >
              <Image src={img.url} alt="" fill sizes="96px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
