import { z } from "zod";

const uuidFormat = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID"
  );

export const therapistSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional().default(""),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #FF0000")
    .optional()
    .or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type TherapistFormData = z.infer<typeof therapistSchema>;

const dayOfWeekEnum = z.enum([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

export const availabilityRuleSchema = z
  .object({
    therapist_id: uuidFormat,
    day_of_week: dayOfWeekEnum,
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format"),
    valid_from: z.string().min(1, "Valid from date is required"),
    valid_until: z.string().optional().default(""),
  })
  .refine((d) => d.start_time < d.end_time, {
    message: "Start time must be before end time",
    path: ["end_time"],
  });

export type AvailabilityRuleFormData = z.infer<typeof availabilityRuleSchema>;

export const timeOffSchema = z
  .object({
    therapist_id: uuidFormat,
    start_at: z.string().min(1, "Start date/time is required"),
    end_at: z.string().min(1, "End date/time is required"),
    reason: z.string().max(500).optional().default(""),
  })
  .refine((d) => d.start_at < d.end_at, {
    message: "Start must be before end",
    path: ["end_at"],
  });

export type TimeOffFormData = z.infer<typeof timeOffSchema>;
