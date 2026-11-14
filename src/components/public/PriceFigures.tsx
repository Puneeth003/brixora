import { formatNumber, formatPrice } from "@/lib/format";
import { GROUP_LABELS, MIN_SAMPLE, localityKey, type PriceCheck, type PriceGroup, type PriceStats, type RateStat } from "@/lib/price-stats";

const listings = (n: number) => `${n} ${n === 1 ? "listing" : "listings"}`;

/** On a sale listing: how its rate per sq.ft sits against others of its kind. */
export function PriceCheckNote({ check, locality, city }: { check: PriceCheck; locality: string; city: string }) {
  const where = check.scope === "locality" ? locality : city;
  const kind = GROUP_LABELS[check.group];
  const tone =
    check.verdict === "below"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : check.verdict === "above"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : "bg-zinc-100 text-zinc-700 ring-zinc-200";
  const verdict =
    check.verdict === "in_line"
      ? "In line with"
      : `${Math.abs(check.percent)}% ${check.verdict === "below" ? "below" : "above"}`;

  return (
    <p className="mt-2 text-sm text-zinc-600">
      <span className={`mr-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tone}`}>
        {verdict}
        {check.verdict === "in_line" ? " the typical rate" : " typical"}
      </span>
      Typical asking rate for {kind} in {where}: ₹{formatNumber(check.stat.typical)} per sq.ft, from {listings(check.stat.count)} on this site.
    </p>
  );
}

function Tile({ label, stat, format, unit }: { label: string; stat: RateStat; format: (n: number) => string; unit: string }) {
  const few = stat.count < MIN_SAMPLE;
  return (
    <div className="card p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">
        {format(stat.typical)}
        <span className="ml-1 text-sm font-normal text-zinc-500">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {stat.count > 1 && stat.low !== stat.high ? `${format(stat.low)} to ${format(stat.high)} · ` : ""}
        {few ? `from only ${listings(stat.count)}` : `from ${listings(stat.count)}`}
      </p>
    </div>
  );
}

/** On a locality page: today's asking prices there. Renders nothing when there are no figures. */
export function LocalityPrices({ stats, locality }: { stats: PriceStats; locality: string }) {
  const key = localityKey(locality);
  const rates = stats.saleRate[key] ?? {};
  const rent = stats.homeRent[key];
  const groups = (Object.keys(GROUP_LABELS) as PriceGroup[]).filter((g) => rates[g]);
  if (!groups.length && !rent) return null;

  const rupees = (n: number) => `₹${formatNumber(n)}`;
  const tileLabel: Record<PriceGroup, string> = { homes: "Homes for sale", plots: "Plots for sale", commercial: "Commercial for sale" };

  return (
    <section className="mt-8" aria-labelledby="prices-title">
      <h2 id="prices-title" className="text-xl font-semibold">
        Asking prices in {locality}
      </h2>
      <p className="mt-1 mb-4 text-sm text-zinc-500">
        The middle asking price of the listings on this site today. A guide, not a valuation.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((g) => (
          <Tile key={g} label={tileLabel[g]} stat={rates[g]!} format={rupees} unit="per sq.ft" />
        ))}
        {rent && <Tile label="Homes for rent" stat={rent} format={(n) => formatPrice(n)} unit="a month" />}
      </div>
    </section>
  );
}
