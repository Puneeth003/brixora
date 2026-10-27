import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { mailConfigured } from "@/lib/mail";
import { PageHeader } from "@/components/admin/ui";
import { AgentForm } from "@/components/crm/forms";

export const metadata: Metadata = { title: "Add staff" };

export default async function NewUserPage() {
  await requireAdmin();
  const mailReady = mailConfigured || process.env.NODE_ENV !== "production";

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/admin/users" className="hover:text-[var(--brand)]">
            ← Users
          </Link>
        }
        title="Add staff"
        description="In-house agents sign in and see only their clients. Partner brokers can be records only (no email) or have a login."
      />
      <div className="card max-w-3xl p-6 sm:p-7">
        <AgentForm mailReady={mailReady} />
      </div>
    </>
  );
}
