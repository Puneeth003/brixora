import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-24 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page isn&apos;t available</h1>
        <p className="mt-2 text-zinc-500">The listing may have been sold or removed.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/properties" className="btn-primary">
            Browse properties
          </Link>
          <Link href="/" className="btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
