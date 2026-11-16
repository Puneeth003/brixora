"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";

/** Public pages: a friendly fallback instead of a blank screen when something breaks. */
export default function SiteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page max-w-xl py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-zinc-600">This page couldn&apos;t load just now. Please try again in a moment.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={() => retry()} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Back to home
        </Link>
      </div>
    </div>
  );
}
