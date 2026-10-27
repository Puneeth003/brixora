"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logClientActivity } from "@/lib/crm";

// Workload page actions. Admin only: assign an unassigned client to an in-house agent.

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function assignClient(formData: FormData) {
  const admin = await requireAdmin();
  const clientId = formData.get("client_id");
  const agentId = formData.get("agent_id");
  if (!isUuid(clientId) || !isUuid(agentId)) return;

  const agent = await db.one<{ id: string; name: string | null; email: string | null }>(
    `SELECT id, name, email FROM users
      WHERE id = ? AND is_active = 1 AND role IN ('admin', 'agent') AND (agent_type IS NULL OR agent_type = 'agent')`,
    [agentId],
  );
  if (!agent) return;

  const changed = await db.update("clients", { assigned_to: agent.id }, "id = ? AND (assigned_to IS NULL OR assigned_to <> ?)", [clientId, agent.id]);
  if (!changed) return;

  await logClientActivity({ clientId, type: "assigned", body: `Assigned to ${agent.name ?? agent.email ?? "agent"}`, actorId: admin.userId });
  revalidatePath("/admin/workload");
}
