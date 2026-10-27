import { Suspense } from "react";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage({ searchParams }: PageProps<"/admin/forgot-password">) {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse" aria-busy="true" />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/admin/forgot-password">, "searchParams">) {
  const { email } = await searchParams;
  // ?email= only prefills the box (welcome emails link here); nothing is sent until submit.
  const prefill = typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  return <ForgotPasswordForm initialEmail={prefill} />;
}
