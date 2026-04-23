"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";

export interface GlobalSearchHit {
  kind: "customer" | "therapist" | "booking";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

/**
 * SPA-003 (lite): global search across customers, therapists, and bookings.
 *
 * Matches customers/therapists by name/phone/email, and bookings by short
 * id prefix. Returns up to 5 hits per kind so the popover stays scannable.
 * Short-circuits on empty/tiny queries to avoid shipping the entire
 * customer table on every keystroke.
 */
export async function globalSearch(q: string): Promise<GlobalSearchHit[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  const clean = trimmed.replace(/[%_]/g, "");
  const phoneQ = normalizeIsraeliPhone(clean);
  const phoneClause = phoneQ.startsWith("+") ? phoneQ.slice(1) : clean;

  const [customers, therapists, bookings] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, phone, email")
      .or(
        `full_name.ilike.%${clean}%,phone.ilike.%${phoneClause}%,email.ilike.%${clean}%`
      )
      .order("full_name")
      .limit(5),
    supabase
      .from("therapists")
      .select("id, full_name, phone, email, is_active")
      .eq("is_active", true)
      .or(
        `full_name.ilike.%${clean}%,phone.ilike.%${phoneClause}%,email.ilike.%${clean}%`
      )
      .order("full_name")
      .limit(5),
    // Bookings match either a short-id prefix (UUID `.` test) or by the
    // linked customer's name/phone — receptionists often ask "find that
    // booking for Dana yesterday".
    supabase
      .from("bookings")
      .select(
        "id, start_at, status, customers!inner(full_name, phone), services(name)"
      )
      .or(
        `full_name.ilike.%${clean}%,phone.ilike.%${phoneClause}%`,
        { referencedTable: "customers" }
      )
      .order("start_at", { ascending: false })
      .limit(5),
  ]);

  const hits: GlobalSearchHit[] = [];

  for (const row of (customers.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    phone: string;
    email: string | null;
  }>) {
    hits.push({
      kind: "customer",
      id: row.id,
      title: row.full_name || row.phone,
      subtitle: row.email ? `${row.phone} · ${row.email}` : row.phone,
      href: `/admin/customers/${row.id}`,
    });
  }
  for (const row of (therapists.data ?? []) as Array<{
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
  }>) {
    hits.push({
      kind: "therapist",
      id: row.id,
      title: row.full_name,
      subtitle: row.phone ?? row.email ?? "",
      href: `/admin/therapists/${row.id}`,
    });
  }
  for (const row of (bookings.data ?? []) as unknown as Array<{
    id: string;
    start_at: string;
    status: string;
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
    hits.push({
      kind: "booking",
      id: row.id,
      title: `${customer} — ${service}`,
      subtitle: `${when} · ${row.status.replace("_", " ")}`,
      href: `/admin/bookings/${row.id}`,
    });
  }

  return hits;
}
