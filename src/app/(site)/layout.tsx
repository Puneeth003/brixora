import { Suspense } from "react";
import { CompareBar } from "@/components/public/Compare";
import { SiteFooter } from "@/components/public/SiteFooter";
import { SiteHeader } from "@/components/public/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      {/* Reads the address in the browser, so it must not hold up the prerendered page. */}
      <Suspense fallback={null}>
        <CompareBar />
      </Suspense>
    </>
  );
}
