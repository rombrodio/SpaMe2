import { z } from "zod";

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
  customer_id: z.string().uuid("Customer is required"),
  therapist_id: z.string().uuid("Therapist is required"),
  room_id: z.string().uuid("Room is required"),
  service_id: z.string().uuid("Service is required"),
  start_at: isoDatetime,
  status: bookingStatusEnum.default("pending_payment"),
  notes: z.string().max(1000).optional().default(""),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const rescheduleBookingSchema = z.object({
  booking_id: z.string().uuid(),
  new_start_at: isoDatetime,
  new_therapist_id: z.string().uuid().optional(),
  new_room_id: z.string().uuid().optional(),
});

export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const cancelBookingSchema = z.object({
  booking_id: z.string().uuid(),
  cancel_reason: z.string().max(500).optional().default(""),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const updateBookingStatusSchema = z.object({
  booking_id: z.string().uuid(),
  new_status: bookingStatusEnum,
});

export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;

export const findSlotsSchema = z.object({
  service_id: z.string().uuid("Service is required"),
  date: z.string().min(1, "Date is required"),
  therapist_id: z.string().uuid().optional(),
});

export type FindSlotsInput = z.infer<typeof findSlotsSchema>;
