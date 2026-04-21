/**
 * Booking engine — server-side orchestrator for booking operations.
 * Fetches required data, delegates to availability engine, then writes to DB.
 * All business rules enforced here before any DB write.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { addMinutes, parseISO, startOfDay, endOfDay } from "date-fns";
import { validateBookingSlot, findAvailableSlots } from "./availability";
import { writeAuditLog } from "@/lib/audit";
import type {
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
  therapist_id: string;
  room_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: string;
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

type PaymentMethod =
  | "credit_card_full"
  | "cash_at_reception"
  | "voucher_dts"
  | "voucher_vpay";

/**
 * Create a new booking with full validation.
 *
 * Phase 4 additions:
 *  - `payment_method` is persisted when the caller already knows which
 *    flow the customer picked (e.g. /book contact form).
 *  - `hold_minutes` sets `hold_expires_at = now() + N min` when the
 *    booking starts out as pending_payment. The hold-expiry cron
 *    cancels bookings where that timestamp has passed. Default: 15.
 */
export async function createBooking(
  supabase: SupabaseClient,
  input: {
    customer_id: string;
    therapist_id: string;
    room_id: string;
    service_id: string;
    start_at: string;
    status: string;
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

  // Fetch service to compute end time
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

  // Validate therapist is active, room is active, customer exists — in parallel
  const [therapistRes, roomRes, customerRes] = await Promise.all([
    supabase
      .from("therapists")
      .select("id, is_active")
      .eq("id", input.therapist_id)
      .single(),
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

  if (therapistRes.error || !therapistRes.data) {
    return { error: { therapist_id: ["Therapist not found"] } };
  }
  if (!therapistRes.data.is_active) {
    return { error: { therapist_id: ["Therapist is not active"] } };
  }
  if (roomRes.error || !roomRes.data) {
    return { error: { room_id: ["Room not found"] } };
  }
  if (!roomRes.data.is_active) {
    return { error: { room_id: ["Room is not active"] } };
  }
  if (customerRes.error || !customerRes.data) {
    return { error: { customer_id: ["Customer not found"] } };
  }

  const totalMinutes = service.duration_minutes + service.buffer_minutes;
  const endDate = addMinutes(startDate, totalMinutes);

  // Fetch validation data, reusing the already-fetched service
  const valData = await fetchValidationData(
    supabase,
    input.therapist_id,
    input.room_id,
    input.service_id,
    startDate,
    endDate,
    service
  );

  // Run conflict checks
  const conflicts = validateBookingSlot({
    therapistId: input.therapist_id,
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
  });

  if (conflicts.length > 0) {
    return {
      error: { _form: conflicts.map((c) => c.message) },
    };
  }

  // Compute hold_expires_at for pending_payment bookings (Phase 4).
  const holdMinutes = input.hold_minutes ?? DEFAULT_HOLD_MINUTES;
  const holdExpiresAtIso =
    input.status === "pending_payment"
      ? addMinutes(new Date(), holdMinutes).toISOString()
      : null;

  // Insert the booking
  const { data: bookingRaw, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      customer_id: input.customer_id,
      therapist_id: input.therapist_id,
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
    })
    .select("*")
    .single();

  if (insertErr) {
    // The DB exclusion constraints are our safety net for concurrent writes
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
 */
export async function findSlots(
  supabase: SupabaseClient,
  serviceId: string,
  date: Date,
  therapistId?: string
): Promise<AvailableSlot[]> {
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
    .select("therapist_id, therapists(id, full_name, color, is_active)")
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
    } => !!r.therapists?.is_active
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
    filterTherapistId: therapistId,
  });
}
