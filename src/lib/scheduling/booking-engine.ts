/**
 * Booking engine — server-side orchestrator for booking operations.
 * Fetches required data, delegates to availability engine, then writes to DB.
 * All business rules enforced here before any DB write.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { addMinutes, parseISO, startOfDay, endOfDay } from "date-fns";
import { validateBookingSlot, findAvailableSlots } from "./availability";
import type {
  BookingConflict,
  AvailableSlot,
  ServiceInfo,
  ExistingBooking,
} from "./types";

type ActionResult =
  | { success: true; data: Record<string, unknown> }
  | { error: Record<string, string[]> };

/**
 * Fetch all data needed to validate a booking at a given time range
 * for a specific therapist/room/service combo.
 */
async function fetchValidationData(
  supabase: SupabaseClient,
  therapistId: string,
  roomId: string,
  serviceId: string,
  rangeStart: Date,
  rangeEnd: Date
) {
  const dateStr = rangeStart.toISOString().slice(0, 10);

  const [
    serviceRes,
    therapistServicesRes,
    roomServicesRes,
    rulesRes,
    timeOffRes,
    roomBlocksRes,
    bookingsRes,
  ] = await Promise.all([
    supabase.from("services").select("*").eq("id", serviceId).single(),
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

  if (serviceRes.error) throw new Error(serviceRes.error.message);

  return {
    service: serviceRes.data as ServiceInfo,
    therapistServiceIds: (therapistServicesRes.data ?? []).map(
      (r: { service_id: string }) => r.service_id
    ),
    roomServiceIds: (roomServicesRes.data ?? []).map(
      (r: { service_id: string }) => r.service_id
    ),
    availabilityRules: rulesRes.data ?? [],
    timeOffs: timeOffRes.data ?? [],
    roomBlocks: roomBlocksRes.data ?? [],
    existingBookings: (bookingsRes.data ?? []) as ExistingBooking[],
  };
}

/**
 * Create a new booking with full validation.
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
  }
): Promise<ActionResult> {
  const startDate = parseISO(input.start_at);

  // Fetch service to compute end time
  const { data: service, error: svcErr } = await supabase
    .from("services")
    .select("duration_minutes, buffer_minutes, price_ils")
    .eq("id", input.service_id)
    .single();
  if (svcErr || !service) {
    return { error: { service_id: ["Service not found"] } };
  }

  const totalMinutes = service.duration_minutes + service.buffer_minutes;
  const endDate = addMinutes(startDate, totalMinutes);

  // Fetch all validation data
  const valData = await fetchValidationData(
    supabase,
    input.therapist_id,
    input.room_id,
    input.service_id,
    startDate,
    endDate
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

  // Insert the booking
  const { data: booking, error: insertErr } = await supabase
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
    })
    .select("*")
    .single();

  if (insertErr) {
    // The DB exclusion constraints are our safety net
    if (insertErr.message.includes("no_therapist_overlap")) {
      return { error: { _form: ["Therapist already has a booking at this time (concurrent conflict)"] } };
    }
    if (insertErr.message.includes("no_room_overlap")) {
      return { error: { _form: ["Room already has a booking at this time (concurrent conflict)"] } };
    }
    return { error: { _form: [insertErr.message] } };
  }

  return { success: true, data: booking };
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

  if (existing.status === "cancelled") {
    return { error: { _form: ["Cannot reschedule a cancelled booking"] } };
  }
  if (existing.status === "completed") {
    return { error: { _form: ["Cannot reschedule a completed booking"] } };
  }

  const therapistId = input.new_therapist_id || existing.therapist_id;
  const roomId = input.new_room_id || existing.room_id;
  const startDate = parseISO(input.new_start_at);

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
    endDate
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

  return { success: true, data: updated };
}

/**
 * Cancel a booking.
 */
export async function cancelBooking(
  supabase: SupabaseClient,
  bookingId: string,
  cancelReason?: string
): Promise<ActionResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .single();

  if (fetchErr || !existing) {
    return { error: { _form: ["Booking not found"] } };
  }

  if (existing.status === "cancelled") {
    return { error: { _form: ["Booking is already cancelled"] } };
  }
  if (existing.status === "completed") {
    return { error: { _form: ["Cannot cancel a completed booking"] } };
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

  return { success: true, data: updated };
}

/**
 * Update booking status (e.g., confirm after payment, mark no-show, complete).
 */
export async function updateBookingStatus(
  supabase: SupabaseClient,
  bookingId: string,
  newStatus: string
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
  const { data: tsRows } = await therapistQuery;
  if (!tsRows || tsRows.length === 0) return [];

  const therapistIds = tsRows
    .filter((r: any) => r.therapists?.is_active)
    .map((r: any) => r.therapist_id);

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
      supabase
        .from("bookings")
        .select("id, therapist_id, room_id, service_id, start_at, end_at, status")
        .neq("status", "cancelled")
        .gte("start_at", dayStart.toISOString())
        .lte("start_at", dayEnd.toISOString()),
    ]);

  // Build therapist data
  const therapists = tsRows
    .filter((r: any) => r.therapists?.is_active)
    .map((r: any) => {
      const t = r.therapists;
      return {
        id: t.id,
        full_name: t.full_name,
        color: t.color,
        availabilityRules: (rulesRes.data ?? []).filter(
          (rule: any) => rule.therapist_id === t.id
        ),
        timeOffs: (timeOffsRes.data ?? []).filter(
          (off: any) => off.therapist_id === t.id
        ),
        serviceIds: [serviceId],
      };
    });

  // Build room data
  const rooms = (roomSvcRes.data ?? [])
    .filter((r: any) => r.rooms?.is_active)
    .map((r: any) => ({
      id: r.rooms.id,
      name: r.rooms.name,
      serviceIds: [serviceId],
      blocks: (roomBlocksRes.data ?? []).filter(
        (b: any) => b.room_id === r.rooms.id
      ),
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
