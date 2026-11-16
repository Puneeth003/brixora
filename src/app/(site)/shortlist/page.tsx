import type { Metadata } from "next";
import { ShortlistView } from "@/components/public/ShortlistView";

export const metadata: Metadata = {
  title: "Your shortlist",
  description: "Properties you saved. No account needed: the list stays on this device.",
  // The page shows whatever this visitor saved; there is nothing here to index.
  robots: { index: false },
};

export default function ShortlistPage() {
  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your shortlist</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500">Saved on this device only. No account needed.</p>
      <ShortlistView />
    </div>
  );
}
