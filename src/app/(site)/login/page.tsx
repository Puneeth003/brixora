import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getOwner } from "@/lib/auth";
import { getSite } from "@/lib/site-settings";
import { AuthScene } from "@/components/AuthScene";
import { ManageLogin } from "@/components/public/ManageLogin";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const site = await getSite();
  return (
    <AuthScene
      logo={false}
      title={
        <>
          List and manage
          <br />
          your property
        </>
      }
      subtitle={`Property owners in ${site.defaultCity}: log in with your WhatsApp number to list a property and follow it. Buyers don't need an account.`}
    >
      <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-black/5" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </AuthScene>
  );
}

const SAFE_NEXT = /^\/(manage|account|properties|post)(\/|\?|$)/;

async function Content({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && SAFE_NEXT.test(next) ? next : "/manage";
  // Already signed in: go straight on.
  if (await getOwner()) redirect(target);
  return <ManageLogin next={target} />;
}
