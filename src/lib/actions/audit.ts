"use server";

import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";

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

/**
 * Row as returned by {@link getAuditLogs} — enriched with a human-readable
 * entity label and an optional deep-link target so the table can render
 * clickable entries instead of opaque 8-char hashes (DEF-011).
 */
export interface EnrichedAuditLogRow extends AuditLogRow {
  entityLabel: string | null;
  entityHref: string | null;
}

export interface AuditLogFilters {
  entity_type?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogPage {
  rows: EnrichedAuditLogRow[];
  total: number;
}

/**
 * Fetch audit log entries, most recent first, with each `entity_id` resolved
 * to a display name + deep link. Batches lookups by entity_type to keep this
 * down to a handful of queries per page.
 *
 * RLS policy `audit_logs_select` (migration 00013) restricts reads to
 * authenticated super_admin users — the cookie-based client is correct here,
 * do NOT use the service-role client.
 */
export async function getAuditLogs(
  filters: AuditLogFilters = {}
): Promise<AuditLogPage> {
  const supabase = await createClient();
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.entity_type) query = query.eq("entity_type", filters.entity_type);
  if (filters.action) query = query.eq("action", filters.action);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AuditLogRow[];
  const total = count ?? rows.length;

  // Bucket entity IDs by type so we can batch-fetch names.
  const idsByType: Record<string, Set<string>> = {};
  for (const row of rows) {
    if (!row.entity_id) continue;
    if (!idsByType[row.entity_type]) idsByType[row.entity_type] = new Set();
    idsByType[row.entity_type].add(row.entity_id);
  }

  const labelMap = new Map<string, string>(); // key: `${type}:${id}` -> label

  async function loadLabels<T extends { id: string }>(
    type: string,
    table: string,
    selectCols: string,
    toLabel: (row: T) => string
  ) {
    const ids = idsByType[type] ? Array.from(idsByType[type]) : [];
    if (ids.length === 0) return;
    const { data: res } = await supabase
      .from(table)
      .select(selectCols)
      .in("id", ids);
    for (const r of (res ?? []) as unknown as T[]) {
      labelMap.set(`${type}:${r.id}`, toLabel(r));
    }
  }

  await Promise.all([
    loadLabels<{ id: string; full_name: string }>(
      "therapist",
      "therapists",
      "id, full_name",
      (r) => r.full_name
    ),
    loadLabels<{ id: string; name: string }>(
      "room",
      "rooms",
      "id, name",
      (r) => r.name
    ),
    loadLabels<{ id: string; name: string }>(
      "service",
      "services",
      "id, name",
      (r) => r.name
    ),
    loadLabels<{ id: string; full_name: string | null; phone: string }>(
      "customer",
      "customers",
      "id, full_name, phone",
      (r) => r.full_name || r.phone
    ),
    (async () => {
      const ids = idsByType["booking"]
        ? Array.from(idsByType["booking"])
        : [];
      if (ids.length === 0) return;
      const { data: res } = await supabase
        .from("bookings")
        .select(
          "id, start_at, customers(full_name, phone), services(name)"
        )
        .in("id", ids);
      for (const row of (res ?? []) as unknown as Array<{
        id: string;
        start_at: string;
        customers: { full_name: string | null; phone: string } | null;
        services: { name: string } | null;
      }>) {
        const customer =
          row.customers?.full_name || row.customers?.phone || "Customer";
        const service = row.services?.name ?? "Booking";
        const when = formatInTimeZone(
          new Date(row.start_at),
          TZ,
          "MMM d, HH:mm"
        );
        labelMap.set(
          `booking:${row.id}`,
          `${customer} — ${service}, ${when}`
        );
      }
    })(),
    (async () => {
      const ids = idsByType["payment"]
        ? Array.from(idsByType["payment"])
        : [];
      if (ids.length === 0) return;
      // payments.amount_ils is stored in agorot (see migration 00008).
      const { data: res } = await supabase
        .from("payments")
        .select("id, amount_ils, booking_id")
        .in("id", ids);
      for (const row of (res ?? []) as unknown as Array<{
        id: string;
        amount_ils: number;
        booking_id: string | null;
      }>) {
        labelMap.set(
          `payment:${row.id}`,
          `₪${(row.amount_ils / 100).toFixed(0)} payment`
        );
      }
    })(),
  ]);

  // Map of payment id → booking id for deep-linking payment rows to the
  // related booking detail page (payments have no standalone admin view).
  const paymentToBooking = new Map<string, string>();
  {
    const ids = idsByType["payment"]
      ? Array.from(idsByType["payment"])
      : [];
    if (ids.length > 0) {
      const { data: res } = await supabase
        .from("payments")
        .select("id, booking_id")
        .in("id", ids);
      for (const row of (res ?? []) as unknown as Array<{
        id: string;
        booking_id: string | null;
      }>) {
        if (row.booking_id) paymentToBooking.set(row.id, row.booking_id);
      }
    }
  }

  function hrefFor(type: string, id: string): string | null {
    switch (type) {
      case "therapist":
        return `/admin/therapists/${id}`;
      case "room":
        return `/admin/rooms/${id}`;
      case "service":
        return `/admin/services/${id}`;
      case "customer":
        return `/admin/customers/${id}`;
      case "booking":
        return `/admin/bookings/${id}`;
      case "payment": {
        const bookingId = paymentToBooking.get(id);
        return bookingId ? `/admin/bookings/${bookingId}` : null;
      }
      default:
        return null;
    }
  }

  const enriched: EnrichedAuditLogRow[] = rows.map((row) => ({
    ...row,
    entityLabel: row.entity_id
      ? labelMap.get(`${row.entity_type}:${row.entity_id}`) ?? null
      : null,
    entityHref: row.entity_id ? hrefFor(row.entity_type, row.entity_id) : null,
  }));

  return { rows: enriched, total };
}
