"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";

/** Admin pages: keeps the sidebar and says what to do, instead of a blank panel. */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return (
    <div className="card mx-auto max-w-xl space-y-3 p-8 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-[var(--s-text-2)]">
        This page hit an error. Try again; if it keeps happening, note the time{digest && <> and the code <span className="font-mono">{digest}</span></>} and check the
        server log.
      </p>
      <div className="flex justify-center gap-3 pt-2">
        <button type="button" onClick={() => retry()} className="btn-primary">
          Try again
        </button>
        <Link href="/admin" className="btn-secondary">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
