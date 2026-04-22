"use server";

import { parseISO } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { bookContactSchema } from "@/lib/schemas/payment";
import {
  createBooking as engineCreate,
  findSlots as engineFindSlots,
} from "@/lib/scheduling/booking-engine";
import { issueOrderToken } from "@/lib/payments/jwt";
import { normalizePhoneIL } from "@/lib/messaging/twilio";
import { writeAuditLog } from "@/lib/audit";

// ────────────────────────────────────────────────────────────
// Catalog reads for the /book service grid (anonymous callers;
// supabase client inherits RLS — `services_access` lets therapists
// AND super_admins read, but NOT anon). We use the service-role
// client here to keep the public /book page working without auth.
// ────────────────────────────────────────────────────────────

export async function getPublicServices() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("services")
    .select("id, name, duration_minutes, buffer_minutes, price_ils")
    .eq("is_active", true)
    .order("name");
  if (error) return [];
  return data ?? [];
}

export interface PublicSlot {
  start: string; // ISO
  end: string; // ISO
  therapist_id: string;
  therapist_name: string;
  therapist_color: string | null;
  room_id: string;
  room_name: string;
}

export async function getPublicSlots(input: {
  service_id: string;
  date: string; // "YYYY-MM-DD"
}): Promise<PublicSlot[]> {
  const admin = createAdminClient();
  const date = parseISO(input.date);
  if (isNaN(date.getTime())) return [];

  const slots = await engineFindSlots(admin, input.service_id, date);
  return slots.map((s) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    therapist_id: s.therapist_id,
    therapist_name: s.therapist_name,
    therapist_color: s.therapist_color ?? null,
    room_id: s.room_id,
    room_name: s.room_name,
  }));
}

// ────────────────────────────────────────────────────────────
// Create booking from /book contact form submit, then hand off to
// /order/<token>.
// ────────────────────────────────────────────────────────────

export async function createBookingFromBookAction(input: {
  service_id: string;
  therapist_id: string;
  room_id: string;
  start_at: string;
  full_name: string;
  phone: string;
  email?: string;
  notes?: string;
}) {
  const parsed = bookContactSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const normalizedPhone = normalizePhoneIL(parsed.data.phone);
  if (!normalizedPhone) {
    return { error: { phone: ["Invalid Israeli phone number"] } };
  }

  const admin = createAdminClient();

  // Find or create customer by normalized phone.
  const { data: existingCustomer } = await admin
    .from("customers")
    .select("id, full_name, email")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  let customerId: string;
  if (existingCustomer) {
    customerId = existingCustomer.id as string;
    // Best-effort: update name/email if the customer provided better info.
    const patch: Record<string, unknown> = {};
    if (parsed.data.full_name && parsed.data.full_name !== existingCustomer.full_name) {
      patch.full_name = parsed.data.full_name;
    }
    if (parsed.data.email && parsed.data.email !== existingCustomer.email) {
      patch.email = parsed.data.email;
    }
    if (Object.keys(patch).length > 0) {
      await admin.from("customers").update(patch).eq("id", customerId);
    }
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from("customers")
      .insert({
        full_name: parsed.data.full_name,
        phone: normalizedPhone,
        email: parsed.data.email || null,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      return {
        error: {
          _form: [insertErr?.message ?? "Failed to create customer"],
        },
      };
    }
    customerId = (inserted as { id: string }).id;
    writeAuditLog({
      userId: null,
      action: "create",
      entityType: "customer",
      entityId: customerId,
      newData: { source: "book_flow", phone: normalizedPhone },
    });
  }

  // Create the booking via the scheduling engine. Status is
  // pending_payment and hold_minutes=15 (default) so the cron can
  // sweep it if the customer abandons the pay page.
  const createResult = await engineCreate(admin, {
    customer_id: customerId,
    therapist_id: parsed.data.therapist_id,
    room_id: parsed.data.room_id,
    service_id: parsed.data.service_id,
    start_at: parsed.data.start_at,
    status: "pending_payment",
    notes: parsed.data.notes || undefined,
    // created_by stays null — no logged-in user; flow source is audit_log.
  });
  if ("error" in createResult) return createResult;

  const bookingRow = createResult.data as { id: string };
  const token = await issueOrderToken({
    bid: bookingRow.id,
    src: "book",
  });

  writeAuditLog({
    userId: null,
    action: "create",
    entityType: "booking",
    entityId: bookingRow.id,
    newData: { source: "book_flow_contact_submit" },
  });

  return {
    success: true,
    data: { bookingId: bookingRow.id, token },
  };
}

/** Utility: check that the token currently served is still valid (cheap). */
export async function isBookingHoldActive(bookingId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("status, hold_expires_at")
    .eq("id", bookingId)
    .single();
  if (!data) return false;
  const row = data as { status: string; hold_expires_at: string | null };
  if (row.status !== "pending_payment") return false;
  if (!row.hold_expires_at) return true; // no expiry set
  return new Date(row.hold_expires_at).getTime() > Date.now();
}
