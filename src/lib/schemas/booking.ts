import { z } from "zod";

const bookingStatusEnum = z.enum([
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);

export type BookingStatus = z.infer<typeof bookingStatusEnum>;

export const createBookingSchema = z.object({
  customer_id: z.string().uuid("Customer is required"),
  therapist_id: z.string().uuid("Therapist is required"),
  room_id: z.string().uuid("Room is required"),
  service_id: z.string().uuid("Service is required"),
  start_at: z.string().min(1, "Start time is required"),
  status: bookingStatusEnum.default("pending_payment"),
  notes: z.string().max(1000).optional().default(""),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updateBookingSchema = z.object({
  customer_id: z.string().uuid("Customer is required").optional(),
  therapist_id: z.string().uuid("Therapist is required").optional(),
  room_id: z.string().uuid("Room is required").optional(),
  service_id: z.string().uuid("Service is required").optional(),
  start_at: z.string().min(1, "Start time is required").optional(),
  status: bookingStatusEnum.optional(),
  notes: z.string().max(1000).optional(),
});

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

export const rescheduleBookingSchema = z.object({
  booking_id: z.string().uuid(),
  new_start_at: z.string().min(1, "New start time is required"),
  new_therapist_id: z.string().uuid().optional(),
  new_room_id: z.string().uuid().optional(),
});

export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const cancelBookingSchema = z.object({
  booking_id: z.string().uuid(),
  cancel_reason: z.string().max(500).optional().default(""),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const findSlotsSchema = z.object({
  service_id: z.string().uuid("Service is required"),
  date: z.string().min(1, "Date is required"),
  therapist_id: z.string().uuid().optional(),
});

export type FindSlotsInput = z.infer<typeof findSlotsSchema>;
