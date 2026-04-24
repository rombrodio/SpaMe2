"use server";

import { z } from "zod";
import { startOfDay, endOfDay, parseISO, subMinutes } from "date-fns";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import {
  fetchMatcherPool,
  computeUnassignedEligibility,
} from "@/lib/scheduling/booking-engine";
import { canPlaceAll, type MatcherBooking } from "@/lib/scheduling/matcher";
import type { ExistingBooking } from "@/lib/scheduling/types";
import {
  notifyManagerReassign,
  notifyTherapistRequest,
} from "@/lib/messaging/notify";
import { getAppUrl } from "@/lib/app-url";

/**
 * Manager assignment screen (/admin/assignments) backend.
 *
 * The screen has three needs:
 *  1. List unassigned bookings in a date window (default: tomorrow).
 *  2. For each unassigned booking, surface the subset of therapists
 *     who can be assigned without breaking capacity for other
 *     unassigned bookings — this is the matcher applied per-candidate.
 *  3. Persist the assignment, transition to pending_confirmation, and
 *     ping the therapist on SMS + WhatsApp.
 */

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

export interface UnassignedBookingForAdmin {
  id: string;
  start_at: string;
  end_at: string;
  created_at: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
  therapist_gender_preference: "male" | "female" | "any";
  customer_full_name: string | null;
  customer_phone: string | null;
  room_name: string | null;
  notes: string | null;
}

export interface EligibleTherapist {
  id: string;
  full_name: string;
  gender: "male" | "female" | null;
  color: string | null;
}

export type AssignmentScope = "all" | "date";

export interface AssignmentScreenData {
  scope: AssignmentScope;
  /** Filter date for scope="date", echoed back for UI state. */
  date: string | null;
  bookings: Array<{
    booking: UnassignedBookingForAdmin;
    eligible: EligibleTherapist[];
  }>;
}

/**
 * Fetch unassigned bookings + the eligible-therapist list for each.
 *
 * Two modes:
 *   - scope="all"  (default): every future non-cancelled unassigned
 *     booking, ordered by start time ascending. Eligibility is
 *     computed per booking in isolation (a therapist appears if they
 *     qualify for the service and are free at that time). The
 *     cross-booking matcher feasibility check is skipped here because
 *     it's only meaningful inside a single day's pool.
 *   - scope="date": same behaviour as before — the day's pool is
 *     matcher-checked so we never surface a therapist whose pick would
 *     leave another same-day booking unplaceable.
 */
export async function getAssignmentScreenData(params: {
  scope?: AssignmentScope;
  date?: string | null; // yyyy-MM-dd in Jerusalem tz (required when scope="date")
}): Promise<AssignmentScreenData> {
  const scope: AssignmentScope = params.scope ?? "all";
  const supabase = await createClient();

  if (scope === "all") {
    return getAllFutureUnassigned(supabase);
  }

  const dateStr = params.date ?? "";
  const targetDate = parseISO(dateStr);
  if (isNaN(targetDate.getTime())) {
    return { scope: "date", date: dateStr, bookings: [] };
  }
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  // Fetch all same-day non-cancelled bookings in one go, then split.
  const { data: dayBookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, therapist_id, service_id, start_at, end_at, status, assignment_status, therapist_gender_preference, notes, created_at, customers(full_name, phone), services(id, name, duration_minutes), rooms(id, name)"
    )
    .neq("status", "cancelled")
    .lt("start_at", dayEnd.toISOString())
    .gt("end_at", dayStart.toISOString())
    .order("start_at");

  const allRows = (dayBookingsRaw ?? []) as unknown as AssignmentRow[];
  const unassignedRows = allRows.filter(
    (r) => r.assignment_status === "unassigned"
  );
  if (unassignedRows.length === 0) {
    return { scope: "date", date: dateStr, bookings: [] };
  }

  // Pool + confirmed rows for eligibility computation.
  const confirmedOrPending = allRows
    .filter((r) => r.assignment_status !== "unassigned")
    .map(
      (r) =>
        ({
          id: r.id,
          therapist_id: r.therapist_id,
          room_id: r.rooms?.id ?? "",
          service_id: r.service_id,
          start_at: r.start_at,
          end_at: r.end_at,
          status: r.status,
        }) as ExistingBooking
    );
  const pool = await fetchMatcherPool(supabase, dayStart, dayEnd);

  // Pre-compute eligibility-in-isolation for every unassigned booking
  // exactly once — reused inside the per-candidate matcher check.
  const isolationEligibility = new Map<string, string[]>();
  for (const u of unassignedRows) {
    isolationEligibility.set(
      u.id,
      computeUnassignedEligibility(
        {
          id: u.id,
          service_id: u.service_id,
          start_at: u.start_at,
          end_at: u.end_at,
          therapist_gender_preference: u.therapist_gender_preference,
        },
        pool,
        confirmedOrPending
      )
    );
  }

  // Fetch therapist details (name, gender, color) for display.
  const candidateIds = Array.from(
    new Set(
      Array.from(isolationEligibility.values()).flatMap((ids) => ids)
    )
  );
  const { data: therapistRows } = candidateIds.length
    ? await supabase
        .from("therapists")
        .select("id, full_name, gender, color")
        .in("id", candidateIds)
    : { data: [] };
  const therapistById = new Map<string, EligibleTherapist>();
  for (const t of (therapistRows ?? []) as Array<{
    id: string;
    full_name: string;
    gender: "male" | "female" | null;
    color: string | null;
  }>) {
    therapistById.set(t.id, {
      id: t.id,
      full_name: t.full_name,
      gender: t.gender,
      color: t.color,
    });
  }

  // For each unassigned, filter the isolation-eligible list by matcher
  // feasibility: pin this candidate to this booking, keep others'
  // normal eligibility, confirm canPlaceAll holds.
  function buildMatcherInputWithPin(
    pinnedBookingId: string,
    pinnedTherapistId: string
  ): MatcherBooking[] {
    return unassignedRows.map((u) => ({
      id: u.id,
      start: new Date(u.start_at),
      end: new Date(u.end_at),
      eligibleTherapistIds:
        u.id === pinnedBookingId
          ? [pinnedTherapistId]
          : isolationEligibility.get(u.id) ?? [],
    }));
  }

  const bookings = unassignedRows.map((u) => {
    const candidates = isolationEligibility.get(u.id) ?? [];
    const eligible: EligibleTherapist[] = [];
    for (const tid of candidates) {
      const input = buildMatcherInputWithPin(u.id, tid);
      if (canPlaceAll(input)) {
        const info = therapistById.get(tid);
        if (info) eligible.push(info);
      }
    }
    eligible.sort((a, b) => a.full_name.localeCompare(b.full_name));

    const booking: UnassignedBookingForAdmin = toAdminBooking(u);
    return { booking, eligible };
  });

  return { scope: "date", date: dateStr, bookings };
}

// ─────────────────────────────────────────────────────────────
// Shared row shape + mapper
// ─────────────────────────────────────────────────────────────

type AssignmentRow = {
  id: string;
  therapist_id: string | null;
  service_id: string;
  start_at: string;
  end_at: string;
  created_at: string;
  status: string;
  assignment_status:
    | "unassigned"
    | "pending_confirmation"
    | "confirmed"
    | "declined";
  therapist_gender_preference: "male" | "female" | "any";
  notes: string | null;
  customers: { full_name: string; phone: string } | null;
  services: {
    id: string;
    name: string;
    duration_minutes: number;
  } | null;
  rooms: { id: string; name: string } | null;
};

function toAdminBooking(u: AssignmentRow): UnassignedBookingForAdmin {
  return {
    id: u.id,
    start_at: u.start_at,
    end_at: u.end_at,
    created_at: u.created_at,
    service_id: u.service_id,
    service_name: u.services?.name ?? "",
    duration_minutes: u.services?.duration_minutes ?? 0,
    therapist_gender_preference: u.therapist_gender_preference,
    customer_full_name: u.customers?.full_name ?? null,
    customer_phone: u.customers?.phone ?? null,
    room_name: u.rooms?.name ?? null,
    notes: u.notes,
  };
}

// ─────────────────────────────────────────────────────────────
// Scope: "all" — every future unassigned booking, newest-slot first
// ─────────────────────────────────────────────────────────────

async function getAllFutureUnassigned(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AssignmentScreenData> {
  // Allow a small look-back so a booking that just started but hasn't
  // been assigned yet (slipped through the notification) is still
  // surfaced, not hidden by end_at.
  const fromIso = subMinutes(new Date(), 30).toISOString();

  const { data } = await supabase
    .from("bookings")
    .select(
      "id, therapist_id, service_id, start_at, end_at, status, assignment_status, therapist_gender_preference, notes, created_at, customers(full_name, phone), services(id, name, duration_minutes), rooms(id, name)"
    )
    .neq("status", "cancelled")
    .eq("assignment_status", "unassigned")
    .gte("start_at", fromIso)
    .order("start_at", { ascending: true })
    .limit(500);

  const rows = (data ?? []) as unknown as AssignmentRow[];
  if (rows.length === 0) {
    return { scope: "all", date: null, bookings: [] };
  }

  // Group by day so matcher feasibility stays meaningful per-day. The
  // top-level list is still global; we just compute eligibility in
  // per-day chunks using the full day pool.
  const byDay = new Map<string, AssignmentRow[]>();
  for (const r of rows) {
    const key = r.start_at.slice(0, 10); // YYYY-MM-DD (UTC key is fine for grouping)
    const bucket = byDay.get(key) ?? [];
    bucket.push(r);
    byDay.set(key, bucket);
  }

  type OutRow = {
    booking: UnassignedBookingForAdmin;
    eligible: EligibleTherapist[];
  };
  const out: OutRow[] = [];

  for (const [dayKey, dayUnassigned] of byDay) {
    const dayStart = startOfDay(parseISO(dayKey));
    const dayEnd = endOfDay(parseISO(dayKey));

    // For cross-booking feasibility we need the *other* bookings on
    // this day too, so pull them.
    const { data: dayAll } = await supabase
      .from("bookings")
      .select(
        "id, therapist_id, service_id, start_at, end_at, status, assignment_status, therapist_gender_preference, notes, created_at, customers(full_name, phone), services(id, name, duration_minutes), rooms(id, name)"
      )
      .neq("status", "cancelled")
      .lt("start_at", dayEnd.toISOString())
      .gt("end_at", dayStart.toISOString());
    const dayRows = (dayAll ?? []) as unknown as AssignmentRow[];
    const confirmedOrPending = dayRows
      .filter((r) => r.assignment_status !== "unassigned")
      .map(
        (r) =>
          ({
            id: r.id,
            therapist_id: r.therapist_id,
            room_id: r.rooms?.id ?? "",
            service_id: r.service_id,
            start_at: r.start_at,
            end_at: r.end_at,
            status: r.status,
          }) as ExistingBooking
      );

    const pool = await fetchMatcherPool(supabase, dayStart, dayEnd);

    const isolationEligibility = new Map<string, string[]>();
    for (const u of dayUnassigned) {
      isolationEligibility.set(
        u.id,
        computeUnassignedEligibility(
          {
            id: u.id,
            service_id: u.service_id,
            start_at: u.start_at,
            end_at: u.end_at,
            therapist_gender_preference: u.therapist_gender_preference,
          },
          pool,
          confirmedOrPending
        )
      );
    }

    const candidateIds = Array.from(
      new Set(Array.from(isolationEligibility.values()).flatMap((ids) => ids))
    );
    const { data: therapistRows } = candidateIds.length
      ? await supabase
          .from("therapists")
          .select("id, full_name, gender, color")
          .in("id", candidateIds)
      : { data: [] };
    const therapistById = new Map<string, EligibleTherapist>();
    for (const t of (therapistRows ?? []) as Array<{
      id: string;
      full_name: string;
      gender: "male" | "female" | null;
      color: string | null;
    }>) {
      therapistById.set(t.id, {
        id: t.id,
        full_name: t.full_name,
        gender: t.gender,
        color: t.color,
      });
    }

    function buildMatcherInputWithPin(
      pinnedBookingId: string,
      pinnedTherapistId: string
    ): MatcherBooking[] {
      return dayUnassigned.map((u) => ({
        id: u.id,
        start: new Date(u.start_at),
        end: new Date(u.end_at),
        eligibleTherapistIds:
          u.id === pinnedBookingId
            ? [pinnedTherapistId]
            : isolationEligibility.get(u.id) ?? [],
      }));
    }

    for (const u of dayUnassigned) {
      const candidates = isolationEligibility.get(u.id) ?? [];
      const eligible: EligibleTherapist[] = [];
      for (const tid of candidates) {
        if (canPlaceAll(buildMatcherInputWithPin(u.id, tid))) {
          const info = therapistById.get(tid);
          if (info) eligible.push(info);
        }
      }
      eligible.sort((a, b) => a.full_name.localeCompare(b.full_name));
      out.push({ booking: toAdminBooking(u), eligible });
    }
  }

  // Final order: by start_at ascending (Map preserved order but we
  // re-sort so earliest unassigned is always at the top).
  out.sort((a, b) => a.booking.start_at.localeCompare(b.booking.start_at));

  return { scope: "all", date: null, bookings: out };
}


// ─────────────────────────────────────────────────────────────
// Mutation: assign a therapist
// ─────────────────────────────────────────────────────────────

const assignSchema = z.object({
  booking_id: z.string().uuid(),
  therapist_id: z.string().uuid(),
});

export async function assignTherapistAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = assignSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: { _form: ["Not authenticated"] } };
  }

  // Fetch the booking + supporting joins.
  const { data: bookingRow, error: fetchErr } = await supabase
    .from("bookings")
    .select(
      "id, assignment_status, service_id, start_at, end_at, therapist_gender_preference, customers(full_name), services(name)"
    )
    .eq("id", parsed.data.booking_id)
    .single();
  if (fetchErr || !bookingRow) {
    return { error: { _form: ["Booking not found"] } };
  }
  const booking = bookingRow as unknown as {
    id: string;
    assignment_status:
      | "unassigned"
      | "pending_confirmation"
      | "confirmed"
      | "declined";
    service_id: string;
    start_at: string;
    end_at: string;
    therapist_gender_preference: "male" | "female" | "any";
    customers: { full_name: string } | null;
    services: { name: string } | null;
  };
  if (booking.assignment_status !== "unassigned") {
    return {
      error: { _form: ["Booking is no longer in an unassigned state"] },
    };
  }

  // Fetch the picked therapist (active + has phone we can reach).
  const { data: therapistRow } = await supabase
    .from("therapists")
    .select("id, full_name, phone, is_active")
    .eq("id", parsed.data.therapist_id)
    .single();
  if (!therapistRow || !therapistRow.is_active) {
    return { error: { _form: ["Therapist not found or inactive"] } };
  }

  // Re-validate matcher feasibility at assign time. The
  // `assignment_status=unassigned` WHERE clause below is the
  // optimistic-concurrency guard; if two managers click Assign at the
  // same time, only the first update lands.
  const dayStart = startOfDay(new Date(booking.start_at));
  const dayEnd = endOfDay(new Date(booking.start_at));

  const { data: dayBookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, therapist_id, service_id, start_at, end_at, status, assignment_status, therapist_gender_preference, rooms(id)"
    )
    .neq("status", "cancelled")
    .lt("start_at", dayEnd.toISOString())
    .gt("end_at", dayStart.toISOString());
  const dayBookings = (dayBookingsRaw ?? []) as unknown as Array<{
    id: string;
    therapist_id: string | null;
    service_id: string;
    start_at: string;
    end_at: string;
    status: string;
    assignment_status:
      | "unassigned"
      | "pending_confirmation"
      | "confirmed"
      | "declined";
    therapist_gender_preference: "male" | "female" | "any";
    rooms: { id: string } | null;
  }>;
  const unassigned = dayBookings.filter(
    (b) => b.assignment_status === "unassigned"
  );
  const confirmedOrPending = dayBookings
    .filter((b) => b.assignment_status !== "unassigned")
    .map(
      (b) =>
        ({
          id: b.id,
          therapist_id: b.therapist_id,
          room_id: b.rooms?.id ?? "",
          service_id: b.service_id,
          start_at: b.start_at,
          end_at: b.end_at,
          status: b.status,
        }) as ExistingBooking
    );
  const pool = await fetchMatcherPool(supabase, dayStart, dayEnd);

  const matcherInput: MatcherBooking[] = unassigned.map((u) => ({
    id: u.id,
    start: new Date(u.start_at),
    end: new Date(u.end_at),
    eligibleTherapistIds:
      u.id === booking.id
        ? [parsed.data.therapist_id]
        : computeUnassignedEligibility(
            {
              id: u.id,
              service_id: u.service_id,
              start_at: u.start_at,
              end_at: u.end_at,
              therapist_gender_preference: u.therapist_gender_preference,
            },
            pool,
            confirmedOrPending
          ),
  }));
  if (!canPlaceAll(matcherInput)) {
    return {
      error: {
        _form: [
          "That therapist can't cover this booking without stranding another. Please pick a different therapist or reassign the blocking booking first.",
        ],
      },
    };
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      therapist_id: parsed.data.therapist_id,
      assignment_status: "pending_confirmation",
      assigned_by: user.id,
      assigned_at: nowIso,
      confirmation_requested_at: nowIso,
    })
    .eq("id", parsed.data.booking_id)
    .eq("assignment_status", "unassigned");
  if (updErr) {
    if (updErr.message.includes("no_therapist_overlap")) {
      return {
        error: {
          _form: [
            "Therapist has a conflicting booking (concurrent conflict) — pick someone else.",
          ],
        },
      };
    }
    return { error: { _form: [updErr.message] } };
  }

  // Fire therapist notification (non-fatal if it fails — audit captures).
  const appUrl = getAppUrl();
  const customerFirstName =
    booking.customers?.full_name?.trim().split(/\s+/)[0] ?? "";
  await notifyTherapistRequest({
    bookingId: parsed.data.booking_id,
    therapistPhone: therapistRow.phone ?? null,
    serviceName: booking.services?.name ?? "",
    startAt: booking.start_at,
    customerFirstName,
    confirmUrl: `${appUrl}/therapist?bookingId=${parsed.data.booking_id}`,
  });

  writeAuditLog({
    userId: user.id,
    action: "update",
    entityType: "booking",
    entityId: parsed.data.booking_id,
    oldData: { assignment_status: "unassigned" },
    newData: {
      assignment_status: "pending_confirmation",
      therapist_id: parsed.data.therapist_id,
      assigned_by: user.id,
    },
  });

  revalidatePath("/admin/assignments");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/bookings");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Therapist confirmation flow
//
// confirmAssignment / declineAssignment are called from the therapist
// portal's "Pending Confirmations" card. They authorize via the Supabase
// cookie-auth client (role=therapist middleware already guards the
// calling route) plus a server-side ownership check: the booking's
// therapist_id must match the caller's linked therapist_id.
// ─────────────────────────────────────────────────────────────

const confirmSchema = z.object({
  booking_id: z.string().uuid(),
});

const declineSchema = z.object({
  booking_id: z.string().uuid(),
  reason: z.string().max(500).optional().default(""),
});

async function getCallerTherapistId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("therapist_id")
    .eq("id", user.id)
    .maybeSingle();
  return (
    (profile as { therapist_id: string | null } | null)?.therapist_id ?? null
  );
}

export async function confirmAssignmentAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = confirmSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const therapistId = await getCallerTherapistId();
  if (!therapistId) {
    return { error: { _form: ["Not authenticated as a therapist"] } };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("bookings")
    .select("id, therapist_id, assignment_status")
    .eq("id", parsed.data.booking_id)
    .maybeSingle();
  if (!existing) {
    return { error: { _form: ["Booking not found"] } };
  }
  if (existing.therapist_id !== therapistId) {
    return { error: { _form: ["This booking isn't assigned to you"] } };
  }
  if (existing.assignment_status !== "pending_confirmation") {
    return {
      error: {
        _form: [
          "This booking isn't in a pending-confirmation state anymore.",
        ],
      },
    };
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      assignment_status: "confirmed",
      confirmed_at: nowIso,
    })
    .eq("id", parsed.data.booking_id)
    .eq("assignment_status", "pending_confirmation");
  if (updErr) {
    return { error: { _form: [updErr.message] } };
  }

  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "booking",
    entityId: parsed.data.booking_id,
    oldData: { assignment_status: "pending_confirmation" },
    newData: { assignment_status: "confirmed", confirmed_at: nowIso },
  });

  revalidatePath("/therapist");
  revalidatePath("/admin/assignments");
  revalidatePath("/admin/calendar");
  return { success: true };
}

export async function declineAssignmentAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = declineSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const therapistId = await getCallerTherapistId();
  if (!therapistId) {
    return { error: { _form: ["Not authenticated as a therapist"] } };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("bookings")
    .select(
      "id, therapist_id, assignment_status, start_at, services(name), therapists(full_name)"
    )
    .eq("id", parsed.data.booking_id)
    .maybeSingle();
  if (!existing) {
    return { error: { _form: ["Booking not found"] } };
  }
  const row = existing as unknown as {
    id: string;
    therapist_id: string | null;
    assignment_status:
      | "unassigned"
      | "pending_confirmation"
      | "confirmed"
      | "declined";
    start_at: string;
    services: { name: string } | null;
    therapists: { full_name: string } | null;
  };
  if (row.therapist_id !== therapistId) {
    return { error: { _form: ["This booking isn't assigned to you"] } };
  }
  if (row.assignment_status !== "pending_confirmation") {
    return {
      error: {
        _form: [
          "This booking isn't in a pending-confirmation state anymore.",
        ],
      },
    };
  }

  const nowIso = new Date().toISOString();
  const reason = parsed.data.reason?.trim() || null;
  const therapistNameSnapshot = row.therapists?.full_name ?? "Therapist";

  // Clear therapist_id and assignment bookkeeping; return the booking
  // to the unassigned queue so the manager can reassign.
  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      therapist_id: null,
      assignment_status: "unassigned",
      assigned_at: null,
      assigned_by: null,
      confirmation_requested_at: null,
      declined_at: nowIso,
      decline_reason: reason,
      // Reset manager_alerted_at so the cron (or the notify below) can
      // re-ping without the idempotency guard blocking us.
      manager_alerted_at: null,
    })
    .eq("id", parsed.data.booking_id)
    .eq("assignment_status", "pending_confirmation");
  if (updErr) {
    return { error: { _form: [updErr.message] } };
  }

  const appUrl = getAppUrl();
  await notifyManagerReassign({
    bookingId: parsed.data.booking_id,
    therapistName: therapistNameSnapshot,
    serviceName: row.services?.name ?? "",
    startAt: row.start_at,
    reason: reason ?? undefined,
    assignUrl: `${appUrl}/admin/assignments?bookingId=${parsed.data.booking_id}`,
  });

  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "booking",
    entityId: parsed.data.booking_id,
    oldData: { assignment_status: "pending_confirmation", therapist_id: therapistId },
    newData: {
      assignment_status: "unassigned",
      declined_at: nowIso,
      decline_reason: reason,
    },
  });

  revalidatePath("/therapist");
  revalidatePath("/admin/assignments");
  revalidatePath("/admin/calendar");
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Therapist-portal query: "my pending confirmations"
// ─────────────────────────────────────────────────────────────

export interface PendingConfirmation {
  id: string;
  start_at: string;
  end_at: string;
  service_name: string;
  duration_minutes: number;
  room_name: string | null;
  customer_first_name: string;
  confirmation_requested_at: string | null;
}

export async function getMyPendingConfirmations(): Promise<
  PendingConfirmation[]
> {
  const therapistId = await getCallerTherapistId();
  if (!therapistId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, start_at, end_at, confirmation_requested_at, services(name, duration_minutes), rooms(name), customers(full_name)"
    )
    .eq("therapist_id", therapistId)
    .eq("assignment_status", "pending_confirmation")
    .order("start_at", { ascending: true });
  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    start_at: string;
    end_at: string;
    confirmation_requested_at: string | null;
    services: { name: string; duration_minutes: number } | null;
    rooms: { name: string } | null;
    customers: { full_name: string } | null;
  }>).map((r) => ({
    id: r.id,
    start_at: r.start_at,
    end_at: r.end_at,
    service_name: r.services?.name ?? "",
    duration_minutes: r.services?.duration_minutes ?? 0,
    room_name: r.rooms?.name ?? null,
    customer_first_name:
      r.customers?.full_name?.trim().split(/\s+/)[0] ?? "",
    confirmation_requested_at: r.confirmation_requested_at,
  }));
}
