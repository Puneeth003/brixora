import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getOwner } from "@/lib/auth";
import { ManageLogin } from "@/components/public/ManageLogin";

export const metadata: Metadata = { title: "Login", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="container-page max-w-md py-12">
      <Suspense fallback={<div className="card h-72 animate-pulse bg-zinc-50" />}>
        <Content searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-center text-sm text-zinc-500">
        Staff?{" "}
        <Link href="/admin/login" className="font-medium text-brand-700 hover:underline">
          Staff login
        </Link>
      </p>
    </div>
  );
}

const SAFE_NEXT = /^\/(manage|account|properties|post)(\/|\?|$)/;

async function Content({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && SAFE_NEXT.test(next) ? next : "/account";
  // Already signed in: go straight on.
  if (await getOwner()) redirect(target);
  return <ManageLogin next={target} title="Sign in or create an account" />;
}
