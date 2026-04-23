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
import type { AvailableSlot } from "@/lib/scheduling/types";

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

/**
 * Anonymous slot shown to the customer. Carries NO therapist identity —
 * only time. The server picks the actual therapist at submit time in
 * createBookingFromBookAction.
 */
export interface PublicSlot {
  start: string; // ISO
  end: string; // ISO
}

export type GenderPreference = "male" | "female" | "any";

/**
 * Minimum time a customer must book in advance. 30 minutes is the spa's
 * prep window — any slot starting sooner is either in the past or too
 * close to be useful. Kept as a constant so it's easy to tune later.
 */
const MIN_LEAD_MINUTES = 30;

export async function getPublicSlots(input: {
  service_id: string;
  date: string; // "YYYY-MM-DD"
  gender_preference?: GenderPreference;
}): Promise<PublicSlot[]> {
  const admin = createAdminClient();
  const date = parseISO(input.date);
  if (isNaN(date.getTime())) return [];

  // Customer-facing: never show past or near-future slots. The admin
  // flow passes no minStart so it can still create ad-hoc bookings.
  const minStart = new Date(Date.now() + MIN_LEAD_MINUTES * 60_000);

  const slots = await engineFindSlots(admin, input.service_id, date, {
    genderFilter: input.gender_preference ?? "any",
    minStart,
  });
  return dedupeByStart(slots);
}

/**
 * The underlying engine returns one AvailableSlot per (therapist, room)
 * pair that can serve a given time. For the customer UI we want exactly
 * one entry per start time — whichever (therapist, room) happens to be
 * eligible doesn't concern the customer. Ordering preserved.
 */
function dedupeByStart(slots: AvailableSlot[]): PublicSlot[] {
  const seen = new Set<string>();
  const out: PublicSlot[] = [];
  for (const s of slots) {
    const key = s.start.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ start: key, end: s.end.toISOString() });
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Create booking from /book contact form submit, then hand off to
// /order/<token>.
// ────────────────────────────────────────────────────────────

export async function createBookingFromBookAction(input: {
  service_id: string;
  start_at: string;
  gender_preference: GenderPreference;
  full_name: string;
  phone: string;
  email?: string;
  notes?: string;
}) {
  // We can't validate via bookContactSchema yet because the client no
  // longer sends therapist_id / room_id. Validate the subset inline.
  const parsed = bookContactSchema
    .pick({
      service_id: true,
      start_at: true,
      full_name: true,
      phone: true,
      email: true,
      notes: true,
    })
    .safeParse({
      service_id: input.service_id,
      start_at: input.start_at,
      full_name: input.full_name,
      phone: input.phone,
      email: input.email,
      notes: input.notes,
    });
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  if (
    input.gender_preference !== "male" &&
    input.gender_preference !== "female" &&
    input.gender_preference !== "any"
  ) {
    return {
      error: { gender_preference: ["Invalid gender preference"] },
    };
  }

  const normalizedPhone = normalizePhoneIL(parsed.data.phone);
  if (!normalizedPhone) {
    return { error: { phone: ["Invalid Israeli phone number"] } };
  }

  const admin = createAdminClient();

  // ── Pick therapist + room server-side ────────────────────
  // Re-run slot search for the requested date so we get the fresh
  // set of eligible (therapist, room) pairs. Filter to ones that
  // match the requested start time exactly.
  const startDate = parseISO(parsed.data.start_at);
  if (isNaN(startDate.getTime())) {
    return { error: { start_at: ["Invalid date/time format"] } };
  }
  const minStart = new Date(Date.now() + MIN_LEAD_MINUTES * 60_000);
  if (startDate.getTime() < minStart.getTime()) {
    return {
      error: {
        start_at: [
          "The requested time is no longer available. Please pick another.",
        ],
      },
    };
  }
  const allSlots = await engineFindSlots(
    admin,
    parsed.data.service_id,
    startDate,
    { genderFilter: input.gender_preference, minStart }
  );
  const startMs = startDate.getTime();
  const candidates = allSlots.filter(
    (s) => s.start.getTime() === startMs
  );
  if (candidates.length === 0) {
    return {
      error: {
        _form: [
          "The requested time is no longer available. Please pick another.",
        ],
      },
    };
  }

  // Random assignment among eligible therapists.
  const picked = candidates[Math.floor(Math.random() * candidates.length)];

  // ── Find or create customer by normalized phone ───────────
  const { data: existingCustomer } = await admin
    .from("customers")
    .select("id, full_name, email")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  let customerId: string;
  if (existingCustomer) {
    customerId = existingCustomer.id as string;
    const patch: Record<string, unknown> = {};
    if (
      parsed.data.full_name &&
      parsed.data.full_name !== existingCustomer.full_name
    ) {
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

  // ── Create booking ────────────────────────────────────────
  const createResult = await engineCreate(admin, {
    customer_id: customerId,
    therapist_id: picked.therapist_id,
    room_id: picked.room_id,
    service_id: parsed.data.service_id,
    start_at: parsed.data.start_at,
    status: "pending_payment",
    notes: parsed.data.notes || undefined,
  });
  if ("error" in createResult) return createResult;

  const bookingRow = createResult.data as { id: string };

  // Persist the gender preference snapshot — createBooking engine
  // doesn't take it yet (not every caller has one).
  if (input.gender_preference !== "any") {
    await admin
      .from("bookings")
      .update({ therapist_gender_preference: input.gender_preference })
      .eq("id", bookingRow.id);
  }

  const token = await issueOrderToken({
    bid: bookingRow.id,
    src: "book",
  });

  writeAuditLog({
    userId: null,
    action: "create",
    entityType: "booking",
    entityId: bookingRow.id,
    newData: {
      source: "book_flow_contact_submit",
      gender_preference: input.gender_preference,
      assigned_therapist_id: picked.therapist_id,
    },
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
  if (!row.hold_expires_at) return true;
  return new Date(row.hold_expires_at).getTime() > Date.now();
}
