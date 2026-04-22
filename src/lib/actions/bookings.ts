"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createBookingSchema,
  cancelBookingSchema,
  rescheduleBookingSchema,
  updateBookingStatusSchema,
  findSlotsSchema,
} from "@/lib/schemas/booking";
import {
  createBooking as engineCreate,
  rescheduleBooking as engineReschedule,
  cancelBooking as engineCancel,
  updateBookingStatus as engineUpdateStatus,
  findSlots as engineFindSlots,
} from "@/lib/scheduling/booking-engine";
import { parseISO } from "date-fns";

// ── Booking Queries ──

export async function getBookings(filters?: {
  status?: string;
  therapist_id?: string;
  customer_id?: string;
  from?: string;
  to?: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("bookings")
    .select(
      "*, customers(id, full_name, phone), therapists(id, full_name, color), rooms(id, name), services(id, name, duration_minutes)"
    )
    .order("start_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.therapist_id)
    query = query.eq("therapist_id", filters.therapist_id);
  if (filters?.customer_id)
    query = query.eq("customer_id", filters.customer_id);
  if (filters?.from) query = query.gte("start_at", filters.from);
  if (filters?.to) query = query.lte("start_at", filters.to);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getBooking(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "*, customers(id, full_name, phone), therapists(id, full_name, color), rooms(id, name), services(id, name, duration_minutes, buffer_minutes, price_ils)"
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Get bookings for a date range (calendar view).
 * Uses interval-overlap semantics so bookings that straddle a range
 * boundary (e.g. start before `from` but end inside) are included.
 */
export async function getBookingsForRange(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "*, customers(id, full_name), therapists(id, full_name, color), rooms(id, name), services(id, name, duration_minutes)"
    )
    .neq("status", "cancelled")
    .lte("start_at", to)
    .gte("end_at", from)
    .order("start_at");
  if (error) throw new Error(error.message);
  return data;
}

// ── Booking Mutations ──

export async function createBookingAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = createBookingSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // Get current user for created_by
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await engineCreate(supabase, {
    ...parsed.data,
    notes: parsed.data.notes || undefined,
    created_by: user?.id,
  });

  if ("error" in result) return result;

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  return { success: true, bookingId: result.data.id as string };
}

export async function rescheduleBookingAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = rescheduleBookingSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const result = await engineReschedule(supabase, parsed.data);

  if ("error" in result) return result;

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  return { success: true };
}

export async function cancelBookingAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = cancelBookingSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await engineCancel(
    supabase,
    parsed.data.booking_id,
    parsed.data.cancel_reason || undefined,
    user?.id
  );

  if ("error" in result) return result;

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  return { success: true };
}

export async function updateBookingStatusAction(
  bookingId: string,
  newStatus: string
) {
  const parsed = updateBookingStatusSchema.safeParse({
    booking_id: bookingId,
    new_status: newStatus,
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await engineUpdateStatus(
    supabase,
    parsed.data.booking_id,
    parsed.data.new_status,
    user?.id
  );

  if ("error" in result) return result;

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/calendar");
  return { success: true };
}

export async function findAvailableSlotsAction(
  serviceId: string,
  dateStr: string,
  therapistId?: string
) {
  const parsed = findSlotsSchema.safeParse({
    service_id: serviceId,
    date: dateStr,
    therapist_id: therapistId,
  });

  if (!parsed.success) {
    return [];
  }

  const supabase = await createClient();
  const date = parseISO(parsed.data.date);
  const slots = await engineFindSlots(supabase, parsed.data.service_id, date, {
    therapistId: parsed.data.therapist_id,
  });

  // Serialize dates for client
  return slots.map((s) => ({
    ...s,
    start: s.start.toISOString(),
    end: s.end.toISOString(),
  }));
}

// ── Data for forms ──

export async function getBookingFormData() {
  const supabase = await createClient();
  const [customers, therapists, rooms, services] = await Promise.all([
    supabase.from("customers").select("id, full_name, phone").order("full_name"),
    supabase
      .from("therapists")
      .select("id, full_name, color")
      .eq("is_active", true)
      .order("full_name"),
    supabase
      .from("rooms")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("services")
      .select("id, name, duration_minutes, price_ils")
      .eq("is_active", true)
      .order("name"),
  ]);

  return {
    customers: customers.data ?? [],
    therapists: therapists.data ?? [],
    rooms: rooms.data ?? [],
    services: services.data ?? [],
  };
}

/**
 * Get therapists qualified for a service and rooms compatible with it.
 */
export async function getServiceConstraints(serviceId: string) {
  const uuidResult = z.string().uuid().safeParse(serviceId);
  if (!uuidResult.success) {
    return { therapistIds: [], roomIds: [] };
  }

  const supabase = await createClient();
  const [therapistSvc, roomSvc] = await Promise.all([
    supabase
      .from("therapist_services")
      .select("therapist_id")
      .eq("service_id", serviceId),
    supabase
      .from("room_services")
      .select("room_id")
      .eq("service_id", serviceId),
  ]);

  return {
    therapistIds: (therapistSvc.data ?? []).map(
      (r: { therapist_id: string }) => r.therapist_id
    ),
    roomIds: (roomSvc.data ?? []).map(
      (r: { room_id: string }) => r.room_id
    ),
  };
}
