import { z } from "zod";

const uuidFormat = z.string().uuid("Invalid UUID");

const isoDatetime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    "Must be a valid datetime (YYYY-MM-DDTHH:MM)"
  );

const bookingStatusEnum = z.enum([
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);

export type BookingStatus = z.infer<typeof bookingStatusEnum>;

export const createBookingSchema = z.object({
  customer_id: uuidFormat,
  therapist_id: uuidFormat,
  room_id: uuidFormat,
  service_id: uuidFormat,
  start_at: isoDatetime,
  status: bookingStatusEnum.default("pending_payment"),
  notes: z.string().max(1000).optional().default(""),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const rescheduleBookingSchema = z.object({
  booking_id: uuidFormat,
  new_start_at: isoDatetime,
  new_therapist_id: uuidFormat.optional(),
  new_room_id: uuidFormat.optional(),
});

export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const cancelBookingSchema = z.object({
  booking_id: uuidFormat,
  cancel_reason: z.string().max(500).optional().default(""),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const updateBookingStatusSchema = z.object({
  booking_id: uuidFormat,
  new_status: bookingStatusEnum,
});

export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;

export const findSlotsSchema = z.object({
  service_id: uuidFormat,
  date: z.string().min(1, "Date is required"),
  therapist_id: uuidFormat.optional(),
});

export type FindSlotsInput = z.infer<typeof findSlotsSchema>;
