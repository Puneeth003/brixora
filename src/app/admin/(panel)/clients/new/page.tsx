import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { staffOptions } from "@/lib/crm";
import { PageHeader } from "@/components/admin/ui";
import { ClientForm } from "@/components/crm/forms";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage() {
  const staff = await requireStaff();
  const staffList = await staffOptions();
  return (
    <>
      <Link href="/admin/clients" className="inline-flex items-center gap-1 text-sm font-bold text-[var(--s-muted)] hover:text-[var(--brand)]">
        ← Clients
      </Link>
      <PageHeader title="Add client" description={staff.role === "admin" ? undefined : "The client will be assigned to you."} />
      <div className="card max-w-3xl p-6 sm:p-8">
        <ClientForm staff={staffList} isAdmin={staff.role === "admin"} />
      </div>
    </>
  );
}
