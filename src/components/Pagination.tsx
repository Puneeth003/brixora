import Link from "next/link";

export function Pagination({
  page,
  pages,
  basePath,
  params,
}: {
  page: number;
  pages: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1,
  );

  return (
    <nav className="mt-8 flex items-center justify-center gap-1 text-sm" aria-label="Pagination">
      {page > 1 && (
        <Link href={href(page - 1)} className="btn-secondary">
          Previous
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-zinc-400">…</span>}
          <Link
            href={href(n)}
            aria-current={n === page ? "page" : undefined}
            className={n === page ? "btn bg-brand-600 text-white" : "btn-ghost"}
          >
            {n}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={href(page + 1)} className="btn-secondary">
          Next
        </Link>
      )}
    </nav>
  );
}
