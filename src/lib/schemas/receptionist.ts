import { z } from "zod";
import {
  availabilityGridOptions,
  MIN_SHIFT_MINUTES,
  SLOT_GRID_MINUTES,
  parseHmToMinutes,
} from "@/lib/schemas/therapist";

const uuidFormat = z.string().uuid("Invalid UUID");

/**
 * Receptionist entity schema. Intentionally lighter than therapistSchema:
 * receptionists carry no scheduling-relevant attributes (no color, no
 * gender, no service qualifications) — they're identified by name,
 * phone, email, active flag.
 */
export const receptionistSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional().default(""),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type ReceptionistFormData = z.infer<typeof receptionistSchema>;

const dayOfWeekEnum = z.enum([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

const gridTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
  .refine(
    (v) => {
      const mins = parseHmToMinutes(v);
      return mins !== null && mins % SLOT_GRID_MINUTES === 0;
    },
    {
      message: `Time must land on a ${SLOT_GRID_MINUTES}-minute boundary (e.g. 09:00, 09:15, 09:30)`,
    }
  );

/**
 * On-duty availability rule schema — single mode covers chat + phone
 * coverage per the Phase 6 decision. Shape mirrors the therapist rule
 * schema so the availability UI can reuse the same 15-minute grid.
 */
export const receptionistAvailabilityRuleSchema = z
  .object({
    receptionist_id: uuidFormat,
    day_of_week: dayOfWeekEnum,
    start_time: gridTimeSchema,
    end_time: gridTimeSchema,
    valid_from: z.string().min(1, "Valid from date is required"),
    valid_until: z.string().optional().default(""),
  })
  .superRefine((d, ctx) => {
    const start = parseHmToMinutes(d.start_time);
    const end = parseHmToMinutes(d.end_time);
    if (start === null || end === null) return;
    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_time"],
        message: "End time must be after start time",
      });
      return;
    }
    if (end - start < MIN_SHIFT_MINUTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_time"],
        message: `Shift must be at least ${MIN_SHIFT_MINUTES} minutes long`,
      });
    }
  });

export type ReceptionistAvailabilityRuleFormData = z.infer<
  typeof receptionistAvailabilityRuleSchema
>;

export { availabilityGridOptions };
