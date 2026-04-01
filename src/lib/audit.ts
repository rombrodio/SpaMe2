import { createAdminClient } from "@/lib/supabase/admin";

type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "login"
  | "payment_webhook";

/**
 * Write an audit log entry. Uses the service-role client to bypass RLS.
 * Fire-and-forget — errors are logged but do not block the caller.
 */
export async function writeAuditLog(params: {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      user_id: params.userId ?? null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      old_data: params.oldData ?? null,
      new_data: params.newData ?? null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}
