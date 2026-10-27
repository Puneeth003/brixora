import { redirect } from "next/navigation";

/** Agents and brokers now live under Users. */
export default function AgentsPage() {
  redirect("/admin/users?tab=agents");
}
