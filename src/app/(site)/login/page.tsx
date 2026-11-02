import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getOwner } from "@/lib/auth";
import { site } from "@/lib/site";
import { AuthScene } from "@/components/AuthScene";
import { ManageLogin } from "@/components/public/ManageLogin";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthScene
      logo={false}
      title={
        <>
          Your next home
          <br />
          starts here
        </>
      }
      subtitle={`Log in to follow your enquiries, saved properties and listings in ${site.defaultCity}.`}
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
  const target = typeof next === "string" && SAFE_NEXT.test(next) ? next : "/account";
  // Already signed in: go straight on.
  if (await getOwner()) redirect(target);
  return <ManageLogin next={target} />;
}
