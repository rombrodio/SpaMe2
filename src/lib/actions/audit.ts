"use server";

import { createClient } from "@/lib/supabase/server";

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogFilters {
  entity_type?: string;
  action?: string;
  limit?: number;
}

/**
 * Fetch audit log entries, most recent first.
 * RLS policy `audit_logs_select` (migration 00013) restricts this to
 * authenticated super_admin users — the cookie-based client is correct here,
 * do NOT use the service-role client.
 */
export async function getAuditLogs(
  filters: AuditLogFilters = {}
): Promise<AuditLogRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.entity_type) query = query.eq("entity_type", filters.entity_type);
  if (filters.action) query = query.eq("action", filters.action);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLogRow[];
}
