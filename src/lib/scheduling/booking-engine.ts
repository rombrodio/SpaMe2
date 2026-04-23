/**
 * Booking engine — server-side orchestrator for booking operations.
 * Fetches required data, delegates to availability engine, then writes to DB.
 * All business rules enforced here before any DB write.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { addMinutes, parseISO, startOfDay, endOfDay, areIntervalsOverlapping } from "date-fns";
import {
  validateBookingSlot,
  findAvailableSlots,
  getTherapistWindows,
  type UnassignedBookingForMatcher,
} from "./availability";
import { canPlaceAll, type MatcherBooking } from "./matcher";
import { writeAuditLog } from "@/lib/audit";
import type {
  AssignmentStatus,
  AvailabilityRule,
  AvailableSlot,
  ExistingBooking,
  RoomBlock,
  ServiceInfo,
  TimeOff,
} from "./types";
import type { ActionResult } from "@/lib/constants";

// Row shapes for joined/typed Supabase responses in this module.
// We don't use generated Supabase types, so queries default to any — these
// interfaces describe the shape each query in this file is known to return.

interface ServiceRow {
  id?: string;
  name?: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_ils: number;
  is_active?: boolean;
}

interface TherapistServiceJoinRow {
  therapist_id: string;
  therapists: {
    id: string;
    full_name: string;
    color: string | null;
    is_active: boolean;
    gender: "male" | "female" | null;
  } | null;
}

interface RoomServiceJoinRow {
  room_id: string;
  service_id: string;
  rooms: {
    id: string;
    name: string;
    is_active: boolean;
  } | null;
}

interface BookingRow {
  id: string;
  customer_id: string;
  // NULL for unassigned bookings (phase 5 deferred-assignment work).
  therapist_id: string | null;
  room_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: string;
  assignment_status: AssignmentStatus;
  price_ils: number;
  notes: string | null;
  created_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all data needed to validate a booking at a given time range.
 * If `service` is already known, pass it to skip a redundant fetch.
 */
async function fetchValidationData(
  supabase: SupabaseClient,
  therapistId: string,
  roomId: string,
  serviceId: string,
  rangeStart: Date,
  rangeEnd: Date,
  knownService?: ServiceRow
) {
  // Fetch service separately — avoids mixing a hand-built Promise.resolve
  // with Supabase's typed query results in the same Promise.all tuple.
  let service: ServiceRow;
  if (knownService) {
    service = knownService;
  } else {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("id", serviceId)
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Service not found");
    }
    service = data as ServiceRow;
  }

  const [
    therapistServicesRes,
    roomServicesRes,
    rulesRes,
    timeOffRes,
    roomBlocksRes,
    bookingsRes,
  ] = await Promise.all([
    supabase
      .from("therapist_services")
      .select("service_id")
      .eq("therapist_id", therapistId),
    supabase
      .from("room_services")
      .select("service_id")
      .eq("room_id", roomId),
    supabase
      .from("therapist_availability_rules")
      .select("*")
      .eq("therapist_id", therapistId),
    supabase
      .from("therapist_time_off")
      .select("*")
      .eq("therapist_id", therapistId)
      .lte("start_at", rangeEnd.toISOString())
      .gte("end_at", rangeStart.toISOString()),
    supabase
      .from("room_blocks")
      .select("*")
      .eq("room_id", roomId)
      .lte("start_at", rangeEnd.toISOString())
      .gte("end_at", rangeStart.toISOString()),
    supabase
      .from("bookings")
      .select("id, therapist_id, room_id, service_id, start_at, end_at, status")
      .neq("status", "cancelled")
      .or(
        `and(therapist_id.eq.${therapistId},start_at.lt.${rangeEnd.toISOString()},end_at.gt.${rangeStart.toISOString()}),and(room_id.eq.${roomId},start_at.lt.${rangeEnd.toISOString()},end_at.gt.${rangeStart.toISOString()})`
      ),
  ]);

  const therapistServiceIds = ((therapistServicesRes.data ?? []) as Array<{
    service_id: string;
  }>).map((r) => r.service_id);
  const roomServiceIds = ((roomServicesRes.data ?? []) as Array<{
    service_id: string;
  }>).map((r) => r.service_id);

  return {
    service: service as ServiceInfo,
    therapistServiceIds,
    roomServiceIds,
    availabilityRules: (rulesRes.data ?? []) as AvailabilityRule[],
    timeOffs: (timeOffRes.data ?? []) as TimeOff[],
    roomBlocks: (roomBlocksRes.data ?? []) as RoomBlock[],
    existingBookings: (bookingsRes.data ?? []) as ExistingBooking[],
  };
}

const TERMINAL_STATUSES = ["cancelled", "completed", "no_show"];

/** Default soft-hold window for pending_payment bookings (see phase 4). */
export const DEFAULT_HOLD_MINUTES = 15;

// ─────────────────────────────────────────────────────────────
// Matcher eligibility helpers (phase 5 — deferred assignment)
//
// The matcher needs to know, for each paid-but-unassigned booking on a
// given day, which therapists could possibly cover it. We compute
// eligibility on the fly rather than storing it: the inputs (rules,
// time-off, confirmed bookings) can change frequently, so a cached
// eligibility set would be stale the moment the admin edits
// availability.
// ─────────────────────────────────────────────────────────────

export interface UnassignedBookingRow {
  id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  therapist_gender_preference: "male" | "female" | "any";
}

export interface MatcherPoolTherapist {
  id: string;
  gender: "male" | "female" | null;
  serviceIds: Set<string>;
  rules: AvailabilityRule[];
  timeOffs: TimeOff[];
}

/**
 * Fetch every active therapist plus all their skills, availability
 * rules, and relevant time-off. Tiny at spa scale; cheaper than
 * scoping per-search because the unassigned bookings may be for
 * services the currently-searched-for service doesn't overlap with.
 */
export async function fetchMatcherPool(
  supabase: SupabaseClient,
  rangeStart: Date,
  rangeEnd: Date
): Promise<MatcherPoolTherapist[]> {
  const [thRes, tsRes, rulesRes, offsRes] = await Promise.all([
    supabase
      .from("therapists")
      .select("id, gender, is_active")
      .eq("is_active", true),
    supabase.from("therapist_services").select("therapist_id, service_id"),
    supabase.from("therapist_availability_rules").select("*"),
    supabase
      .from("therapist_time_off")
      .select("*")
      .lte("start_at", rangeEnd.toISOString())
      .gte("end_at", rangeStart.toISOString()),
  ]);

  const therapistRows = (thRes.data ?? []) as Array<{
    id: string;
    gender: "male" | "female" | null;
  }>;
  const tsRows = (tsRes.data ?? []) as Array<{
    therapist_id: string;
    service_id: string;
  }>;
  const rules = (rulesRes.data ?? []) as AvailabilityRule[];
  const offs = (offsRes.data ?? []) as TimeOff[];

  return therapistRows.map((t) => ({
    id: t.id,
    gender: t.gender,
    serviceIds: new Set(
      tsRows.filter((r) => r.therapist_id === t.id).map((r) => r.service_id)
    ),
    rules: rules.filter((r) => r.therapist_id === t.id),
    timeOffs: offs.filter((o) => o.therapist_id === t.id),
  }));
}

/**
 * Compute the eligible therapist set for one paid-but-unassigned
 * booking: qualified for the service, gender preference satisfied,
 * has an availability window covering the booking, and isn't
 * consumed by a confirmed (or pending_confirmation) booking during
 * that window.
 */
export function computeUnassignedEligibility(
  booking: UnassignedBookingRow,
  pool: readonly MatcherPoolTherapist[],
  confirmedOrPending: readonly ExistingBooking[]
): string[] {
  const bStart = new Date(booking.start_at);
  const bEnd = new Date(booking.end_at);

  return pool
    .filter((t) => {
      if (!t.serviceIds.has(booking.service_id)) return false;
      if (
        booking.therapist_gender_preference !== "any" &&
        t.gender !== booking.therapist_gender_preference
      ) {
        return false;
      }
      const windows = getTherapistWindows(bStart, t.rules, t.timeOffs);
      const covered = windows.some(
        (w) => bStart.getTime() >= w.start.getTime() && bEnd.getTime() <= w.end.getTime()
      );
      if (!covered) return false;
      const busy = confirmedOrPending.some(
        (b) =>
          b.therapist_id === t.id &&
          areIntervalsOverlapping(
            { start: bStart, end: bEnd },
            { start: new Date(b.start_at), end: new Date(b.end_at) }
          )
      );
      return !busy;
    })
    .map((t) => t.id);
}

/**
 * End-to-end helper: pulls every unassigned booking on the day and
 * computes per-booking eligibility. Returns an empty array when none
 * exist — callers can short-circuit.
 */
async function buildUnassignedForMatcher(
  supabase: SupabaseClient,
  dayStart: Date,
  dayEnd: Date,
  excludeBookingId?: string
): Promise<UnassignedBookingForMatcher[]> {
  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, therapist_id, service_id, start_at, end_at, status, assignment_status, therapist_gender_preference"
    )
    .neq("status", "cancelled")
    .lt("start_at", dayEnd.toISOString())
    .gt("end_at", dayStart.toISOString());

  const rows = (bookingsRaw ?? []) as Array<
    ExistingBooking & {
      assignment_status: AssignmentStatus;
      therapist_gender_preference: "male" | "female" | "any";
    }
  >;

  const unassigned = rows.filter(
    (r) =>
      r.assignment_status === "unassigned" && r.id !== excludeBookingId
  );
  if (unassigned.length === 0) return [];

  const confirmedOrPending = rows.filter(
    (r) => r.assignment_status !== "unassigned"
  );
  const pool = await fetchMatcherPool(supabase, dayStart, dayEnd);

  return unassigned.map((u) => ({
    id: u.id,
    start_at: u.start_at,
    end_at: u.end_at,
    eligibleTherapistIds: computeUnassignedEligibility(
      u,
      pool,
      confirmedOrPending
    ),
  }));
}

type PaymentMethod =
  | "credit_card_full"
  | "cash_at_reception"
  | "voucher_dts"
  | "voucher_vpay";

/**
 * Create a new booking with full validation.
 *
 * Two modes, selected by the combination of `therapist_id` +
 * `assignment_status` on the input:
 *
 *  A. PINNED — therapist_id is set. Standard flow: validates therapist
 *     is active + qualified + free, plus the matcher gate from Phase 2
 *     so pinning a therapist doesn't strand a paid-but-unassigned
 *     neighbour.
 *
 *  B. UNASSIGNED — therapist_id is omitted (or input.assignment_status
 *     is 'unassigned'). Used by the /book customer flow and the admin
 *     "leave unassigned" toggle. Skips therapist-specific checks,
 *     validates the room, computes the new booking's eligibility, and
 *     runs the matcher to confirm capacity still fits (existing
 *     unassigneds + this new one).
 *
 * Common to both modes:
 *  - Service active, room active, customer exists.
 *  - `payment_method` / `hold_minutes` control the payment handoff
 *    (Phase 4 of the payments work).
 *  - `assignment_status` defaults to 'confirmed' in pinned mode and
 *    'unassigned' otherwise.
 */
export async function createBooking(
  supabase: SupabaseClient,
  input: {
    customer_id: string;
    /** Omit (or leave undefined) to create an unassigned booking. */
    therapist_id?: string;
    room_id: string;
    service_id: string;
    start_at: string;
    status: string;
    assignment_status?: AssignmentStatus;
    /**
     * Customer's gender preference for the therapist. Persisted on the
     * booking row and used by the unassigned-path matcher to compute
     * eligibility. Defaults to 'any'.
     */
    therapist_gender_preference?: "male" | "female" | "any";
    notes?: string;
    created_by?: string;
    payment_method?: PaymentMethod;
    hold_minutes?: number;
  }
): Promise<ActionResult> {
  const startDate = parseISO(input.start_at);
  if (isNaN(startDate.getTime())) {
    return { error: { start_at: ["Invalid date/time format"] } };
  }

  const isUnassigned =
    !input.therapist_id || input.assignment_status === "unassigned";

  // Fetch service (needed by both paths)
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("duration_minutes, buffer_minutes, price_ils, is_active")
    .eq("id", input.service_id)
    .single();
  if (svcErr || !service) {
    return { error: { service_id: ["Service not found"] } };
  }
  if (!service.is_active) {
    return { error: { service_id: ["Service is not active"] } };
  }

  const totalMinutes = service.duration_minutes + service.buffer_minutes;
  const endDate = addMinutes(startDate, totalMinutes);
  const dayStart = startOfDay(startDate);
  const dayEnd = endOfDay(startDate);
  const genderPref = input.therapist_gender_preference ?? "any";

  // Validate room + customer (both paths need these)
  const [roomRes, customerRes] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, is_active")
      .eq("id", input.room_id)
      .single(),
    supabase
      .from("customers")
      .select("id")
      .eq("id", input.customer_id)
      .single(),
  ]);
  if (roomRes.error || !roomRes.data) {
    return { error: { room_id: ["Room not found"] } };
  }
  if (!roomRes.data.is_active) {
    return { error: { room_id: ["Room is not active"] } };
  }
  if (customerRes.error || !customerRes.data) {
    return { error: { customer_id: ["Customer not found"] } };
  }

  // ──────────────────────────────────────────────────────────
  // Branch on mode
  // ──────────────────────────────────────────────────────────

  if (!isUnassigned) {
    // ── PINNED mode (existing behaviour + matcher gate) ──
    const therapistId = input.therapist_id!;

    const { data: therapistRow, error: therapistErr } = await supabase
      .from("therapists")
      .select("id, is_active")
      .eq("id", therapistId)
      .single();
    if (therapistErr || !therapistRow) {
      return { error: { therapist_id: ["Therapist not found"] } };
    }
    if (!therapistRow.is_active) {
      return { error: { therapist_id: ["Therapist is not active"] } };
    }

    const valData = await fetchValidationData(
      supabase,
      therapistId,
      input.room_id,
      input.service_id,
      startDate,
      endDate,
      service
    );
    const unassignedForMatcher = await buildUnassignedForMatcher(
      supabase,
      dayStart,
      dayEnd
    );
    const conflicts = validateBookingSlot({
      therapistId,
      roomId: input.room_id,
      serviceId: input.service_id,
      start: startDate,
      end: endDate,
      availabilityRules: valData.availabilityRules,
      timeOffs: valData.timeOffs,
      roomBlocks: valData.roomBlocks,
      existingBookings: valData.existingBookings,
      therapistServiceIds: valData.therapistServiceIds,
      roomServiceIds: valData.roomServiceIds,
      unassignedBookingsForMatcher: unassignedForMatcher,
    });
    if (conflicts.length > 0) {
      return { error: { _form: conflicts.map((c) => c.message) } };
    }
  } else {
    // ── UNASSIGNED mode (/book flow + admin leave-unassigned) ──
    //
    // Steps:
    //  1. Room compatibility (room_services join) + room blocks + no
    //     concurrent room booking. Same guarantees the pinned path has,
    //     just via a smaller targeted fetch since we don't need
    //     therapist data.
    //  2. Capacity check: compute new-booking eligibility (qualified +
    //     gender-matching + window-covering + not consumed by confirmed
    //     bookings), fetch existing unassigned bookings for the day
    //     with their eligibility, run canPlaceAll. Reject if the full
    //     set can't be placed.

    const [roomSvcRes, roomBlocksRes, roomBookingsRes] = await Promise.all([
      supabase
        .from("room_services")
        .select("service_id")
        .eq("room_id", input.room_id),
      supabase
        .from("room_blocks")
        .select("id, room_id, start_at, end_at")
        .eq("room_id", input.room_id)
        .lte("start_at", endDate.toISOString())
        .gte("end_at", startDate.toISOString()),
      supabase
        .from("bookings")
        .select("id, room_id, start_at, end_at, status")
        .eq("room_id", input.room_id)
        .neq("status", "cancelled")
        .lt("start_at", endDate.toISOString())
        .gt("end_at", startDate.toISOString()),
    ]);

    const roomServiceIds = (
      (roomSvcRes.data ?? []) as Array<{ service_id: string }>
    ).map((r) => r.service_id);
    if (!roomServiceIds.includes(input.service_id)) {
      return {
        error: { _form: ["Room is not compatible with this service"] },
      };
    }
    if ((roomBlocksRes.data ?? []).length > 0) {
      return {
        error: { _form: ["Room is blocked during this period"] },
      };
    }
    if ((roomBookingsRes.data ?? []).length > 0) {
      return {
        error: {
          _form: ["Room already has a booking at this time"],
        },
      };
    }

    // Capacity matcher: can we place every unassigned booking on the
    // day (including this new one) without double-booking any therapist?
    const pool = await fetchMatcherPool(supabase, dayStart, dayEnd);

    const { data: dayBookingsRaw } = await supabase
      .from("bookings")
      .select(
        "id, therapist_id, service_id, start_at, end_at, status, assignment_status, therapist_gender_preference"
      )
      .neq("status", "cancelled")
      .lt("start_at", dayEnd.toISOString())
      .gt("end_at", dayStart.toISOString());

    const dayBookings = (dayBookingsRaw ?? []) as Array<
      ExistingBooking & {
        assignment_status: AssignmentStatus;
        therapist_gender_preference: "male" | "female" | "any";
      }
    >;
    const existingUnassigned = dayBookings.filter(
      (b) => b.assignment_status === "unassigned"
    );
    const confirmedOrPending = dayBookings.filter(
      (b) => b.assignment_status !== "unassigned"
    );

    const newEligibility = computeUnassignedEligibility(
      {
        id: "__new__",
        service_id: input.service_id,
        start_at: startDate.toISOString(),
        end_at: endDate.toISOString(),
        therapist_gender_preference: genderPref,
      },
      pool,
      confirmedOrPending
    );
    if (newEligibility.length === 0) {
      return {
        error: {
          _form: [
            "No eligible therapists are available for this time slot. Please pick a different time.",
          ],
        },
      };
    }

    const matcherInput: MatcherBooking[] = [
      ...existingUnassigned.map((u) => ({
        id: u.id,
        start: new Date(u.start_at),
        end: new Date(u.end_at),
        eligibleTherapistIds: computeUnassignedEligibility(
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
      })),
      {
        id: "__new__",
        start: startDate,
        end: endDate,
        eligibleTherapistIds: newEligibility,
      },
    ];
    if (!canPlaceAll(matcherInput)) {
      return {
        error: {
          _form: [
            "Capacity exhausted for this time slot. Please pick another.",
          ],
        },
      };
    }
  }

  // ──────────────────────────────────────────────────────────
  // Insert (both modes converge)
  // ──────────────────────────────────────────────────────────

  const holdMinutes = input.hold_minutes ?? DEFAULT_HOLD_MINUTES;
  const holdExpiresAtIso =
    input.status === "pending_payment"
      ? addMinutes(new Date(), holdMinutes).toISOString()
      : null;
  const assignmentStatus: AssignmentStatus =
    input.assignment_status ?? (isUnassigned ? "unassigned" : "confirmed");

  const { data: bookingRaw, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      customer_id: input.customer_id,
      therapist_id: isUnassigned ? null : input.therapist_id!,
      room_id: input.room_id,
      service_id: input.service_id,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      status: input.status,
      price_ils: service.price_ils,
      notes: input.notes || null,
      created_by: input.created_by || null,
      payment_method: input.payment_method ?? null,
      hold_expires_at: holdExpiresAtIso,
      assignment_status: assignmentStatus,
      therapist_gender_preference: genderPref,
    })
    .select("*")
    .single();

  if (insertErr) {
    if (insertErr.message.includes("no_therapist_overlap")) {
      return { error: { _form: ["Therapist already has a booking at this time (concurrent conflict)"] } };
    }
    if (insertErr.message.includes("no_room_overlap")) {
      return { error: { _form: ["Room already has a booking at this time (concurrent conflict)"] } };
    }
    return { error: { _form: [insertErr.message] } };
  }

  const booking = bookingRaw as BookingRow;

  writeAuditLog({
    userId: input.created_by,
    action: "create",
    entityType: "booking",
    entityId: booking.id,
    newData: booking as unknown as Record<string, unknown>,
  });

  return { success: true, data: booking as unknown as Record<string, unknown> };
}

/**
 * Reschedule a booking to a new time (and optionally new therapist/room).
 */
export async function rescheduleBooking(
  supabase: SupabaseClient,
  input: {
    booking_id: string;
    new_start_at: string;
    new_therapist_id?: string;
    new_room_id?: string;
  }
): Promise<ActionResult> {
  // Fetch the existing booking
  const { data: existing, error: fetchErr } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", input.booking_id)
    .single();

  if (fetchErr || !existing) {
    return { error: { _form: ["Booking not found"] } };
  }

  if (TERMINAL_STATUSES.includes(existing.status)) {
    return { error: { _form: [`Cannot reschedule a ${existing.status.replace("_", " ")} booking`] } };
  }

  const therapistId = input.new_therapist_id || existing.therapist_id;
  const roomId = input.new_room_id || existing.room_id;
  const startDate = parseISO(input.new_start_at);
  if (isNaN(startDate.getTime())) {
    return { error: { new_start_at: ["Invalid date/time format"] } };
  }

  // Get service info for duration
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("duration_minutes, buffer_minutes, price_ils")
    .eq("id", existing.service_id)
    .single();
  if (svcErr || !service) {
    return { error: { _form: ["Service not found"] } };
  }

  const totalMinutes = service.duration_minutes + service.buffer_minutes;
  const endDate = addMinutes(startDate, totalMinutes);

  // Validate the new slot
  const valData = await fetchValidationData(
    supabase,
    therapistId,
    roomId,
    existing.service_id,
    startDate,
    endDate,
    service
  );

  // Matcher gate: reschedule must not strand an unassigned booking by
  // consuming a therapist it still needs. Exclude the booking being
  // rescheduled from the pool (self-shouldn't count against itself).
  const rescheduleDayStart = startOfDay(startDate);
  const rescheduleDayEnd = endOfDay(startDate);
  const unassignedForMatcher = await buildUnassignedForMatcher(
    supabase,
    rescheduleDayStart,
    rescheduleDayEnd,
    input.booking_id
  );

  const conflicts = validateBookingSlot({
    therapistId,
    roomId,
    serviceId: existing.service_id,
    start: startDate,
    end: endDate,
    availabilityRules: valData.availabilityRules,
    timeOffs: valData.timeOffs,
    roomBlocks: valData.roomBlocks,
    existingBookings: valData.existingBookings,
    therapistServiceIds: valData.therapistServiceIds,
    roomServiceIds: valData.roomServiceIds,
    excludeBookingId: input.booking_id,
    unassignedBookingsForMatcher: unassignedForMatcher,
  });

  if (conflicts.length > 0) {
    return {
      error: { _form: conflicts.map((c) => c.message) },
    };
  }

  // Update the booking
  const { data: updated, error: updateErr } = await supabase
    .from("bookings")
    .update({
      therapist_id: therapistId,
      room_id: roomId,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
    })
    .eq("id", input.booking_id)
    .select("*")
    .single();

  if (updateErr) {
    if (updateErr.message.includes("no_therapist_overlap")) {
      return { error: { _form: ["Therapist already has a booking at this time (concurrent conflict)"] } };
    }
    if (updateErr.message.includes("no_room_overlap")) {
      return { error: { _form: ["Room already has a booking at this time (concurrent conflict)"] } };
    }
    return { error: { _form: [updateErr.message] } };
  }

  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "booking",
    entityId: input.booking_id,
    oldData: { start_at: existing.start_at, end_at: existing.end_at, therapist_id: existing.therapist_id, room_id: existing.room_id },
    newData: { start_at: updated.start_at, end_at: updated.end_at, therapist_id: updated.therapist_id, room_id: updated.room_id },
  });

  return { success: true, data: updated };
}

/**
 * Cancel a booking.
 */
export async function cancelBooking(
  supabase: SupabaseClient,
  bookingId: string,
  cancelReason?: string,
  userId?: string | null
): Promise<ActionResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .single();

  if (fetchErr || !existing) {
    return { error: { _form: ["Booking not found"] } };
  }

  if (TERMINAL_STATUSES.includes(existing.status)) {
    return { error: { _form: [`Cannot cancel a ${existing.status.replace("_", " ")} booking`] } };
  }

  const { data: updated, error: updateErr } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: cancelReason || null,
    })
    .eq("id", bookingId)
    .select("*")
    .single();

  if (updateErr) {
    return { error: { _form: [updateErr.message] } };
  }

  writeAuditLog({
    userId,
    action: "status_change",
    entityType: "booking",
    entityId: bookingId,
    oldData: { status: existing.status },
    newData: { status: "cancelled", cancel_reason: cancelReason || null },
  });

  return { success: true, data: updated };
}

/**
 * Update booking status (e.g., confirm after payment, mark no-show, complete).
 */
export async function updateBookingStatus(
  supabase: SupabaseClient,
  bookingId: string,
  newStatus: string,
  userId?: string | null
): Promise<ActionResult> {
  const validTransitions: Record<string, string[]> = {
    pending_payment: ["confirmed", "cancelled"],
    confirmed: ["completed", "no_show", "cancelled"],
  };

  const { data: existing, error: fetchErr } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .single();

  if (fetchErr || !existing) {
    return { error: { _form: ["Booking not found"] } };
  }

  const allowed = validTransitions[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return {
      error: {
        _form: [
          `Cannot transition from "${existing.status}" to "${newStatus}"`,
        ],
      },
    };
  }

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "cancelled") {
    updateData.cancelled_at = new Date().toISOString();
  }

  const { data: updated, error: updateErr } = await supabase
    .from("bookings")
    .update(updateData)
    .eq("id", bookingId)
    .select("*")
    .single();

  if (updateErr) {
    return { error: { _form: [updateErr.message] } };
  }

  writeAuditLog({
    userId,
    action: "status_change",
    entityType: "booking",
    entityId: bookingId,
    oldData: { status: existing.status },
    newData: { status: newStatus },
  });

  return { success: true, data: updated };
}

/**
 * Find available slots for a service on a date (used by slot-finder UI and AI).
 *
 * Options:
 *   - therapistId: restrict to one specific therapist (used by admin
 *     "book for X" flow). Leave undefined for the open pool.
 *   - genderFilter: customer's gender preference on /book. 'any' or
 *     undefined = no filter. 'male' / 'female' narrows the candidate
 *     pool to matching therapists. Rows whose gender is NULL (legacy
 *     therapists pre-00017) are excluded when a specific gender is
 *     requested — safer than silently including them.
 */
export async function findSlots(
  supabase: SupabaseClient,
  serviceId: string,
  date: Date,
  options: {
    therapistId?: string;
    genderFilter?: "male" | "female" | "any";
    /** Earliest allowed slot start. Forwarded to findAvailableSlots. */
    minStart?: Date;
  } = {}
): Promise<AvailableSlot[]> {
  const therapistId = options.therapistId;
  const genderFilter =
    options.genderFilter && options.genderFilter !== "any"
      ? options.genderFilter
      : undefined;
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // Fetch service
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("is_active", true)
    .single();
  if (svcErr || !service) return [];

  // Fetch qualified therapists
  let therapistQuery = supabase
    .from("therapist_services")
    .select(
      "therapist_id, therapists(id, full_name, color, is_active, gender)"
    )
    .eq("service_id", serviceId);
  if (therapistId) {
    therapistQuery = therapistQuery.eq("therapist_id", therapistId);
  }
  const { data: rawTsRows } = await therapistQuery;
  // Supabase's inferred type treats the joined `therapists` as an array
  // because the client doesn't know about FK cardinality without generated
  // types. At runtime this join returns a single object (many-to-one).
  const tsRows = (rawTsRows ?? []) as unknown as TherapistServiceJoinRow[];
  if (tsRows.length === 0) return [];

  const activeTsRows = tsRows.filter(
    (r): r is TherapistServiceJoinRow & {
      therapists: NonNullable<TherapistServiceJoinRow["therapists"]>;
    } => {
      const t = r.therapists;
      if (!t?.is_active) return false;
      if (genderFilter && t.gender !== genderFilter) return false;
      return true;
    }
  );

  const therapistIds = activeTsRows.map((r) => r.therapist_id);

  if (therapistIds.length === 0) return [];

  // Fetch availability rules, time-offs, and room data in parallel
  const [rulesRes, timeOffsRes, roomSvcRes, roomBlocksRes, bookingsRes] =
    await Promise.all([
      supabase
        .from("therapist_availability_rules")
        .select("*")
        .in("therapist_id", therapistIds),
      supabase
        .from("therapist_time_off")
        .select("*")
        .in("therapist_id", therapistIds)
        .lte("start_at", dayEnd.toISOString())
        .gte("end_at", dayStart.toISOString()),
      supabase
        .from("room_services")
        .select("room_id, service_id, rooms(id, name, is_active)")
        .eq("service_id", serviceId),
      supabase.from("room_blocks").select("*")
        .lte("start_at", dayEnd.toISOString())
        .gte("end_at", dayStart.toISOString()),
      // Use overlap logic: start_at < dayEnd AND end_at > dayStart
      supabase
        .from("bookings")
        .select("id, therapist_id, room_id, service_id, start_at, end_at, status")
        .neq("status", "cancelled")
        .lt("start_at", dayEnd.toISOString())
        .gt("end_at", dayStart.toISOString()),
    ]);

  const allRules = (rulesRes.data ?? []) as AvailabilityRule[];
  const allTimeOffs = (timeOffsRes.data ?? []) as TimeOff[];
  const allRoomBlocks = (roomBlocksRes.data ?? []) as RoomBlock[];
  const roomSvcRows = (roomSvcRes.data ?? []) as unknown as RoomServiceJoinRow[];

  // Build therapist data
  const therapists = activeTsRows.map((r) => {
    const t = r.therapists;
    return {
      id: t.id,
      full_name: t.full_name,
      color: t.color,
      availabilityRules: allRules.filter((rule) => rule.therapist_id === t.id),
      timeOffs: allTimeOffs.filter((off) => off.therapist_id === t.id),
      serviceIds: [serviceId],
    };
  });

  // Build unassigned-booking matcher input. Uses a broader data fetch
  // than the narrow per-service query above, because unassigned bookings
  // can be for services the searched service doesn't share a pool with.
  const unassignedBookings = await buildUnassignedForMatcher(
    supabase,
    dayStart,
    dayEnd
  );

  // Build room data
  const rooms = roomSvcRows
    .filter((r): r is RoomServiceJoinRow & {
      rooms: NonNullable<RoomServiceJoinRow["rooms"]>;
    } => !!r.rooms?.is_active)
    .map((r) => ({
      id: r.rooms.id,
      name: r.rooms.name,
      serviceIds: [serviceId],
      blocks: allRoomBlocks.filter((b) => b.room_id === r.rooms.id),
    }));

  return findAvailableSlots({
    date,
    service: service as ServiceInfo,
    therapists,
    rooms,
    existingBookings: (bookingsRes.data ?? []) as ExistingBooking[],
    unassignedBookings,
    filterTherapistId: therapistId,
    minStart: options.minStart,
  });
}
