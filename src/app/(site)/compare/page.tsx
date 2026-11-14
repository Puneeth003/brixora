import type { Metadata } from "next";
import { CompareTable } from "@/components/public/Compare";

export const metadata: Metadata = {
  title: "Compare properties",
  description: "Put up to three properties side by side: price, price per sq.ft, size, bedrooms and more.",
  // The page shows whatever this visitor picked; there is nothing here to index.
  robots: { index: false },
};

export default function ComparePage() {
  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Compare properties</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500">Your choices are remembered on this device only.</p>
      <CompareTable />
    </div>
  );
}
