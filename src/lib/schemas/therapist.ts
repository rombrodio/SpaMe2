import { z } from "zod";

const uuidFormat = z.string().uuid("Invalid UUID");

export const therapistGenderEnum = z.enum(["male", "female"]);
export type TherapistGender = z.infer<typeof therapistGenderEnum>;

export const therapistSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional().default(""),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #FF0000")
    .optional()
    .or(z.literal("")),
  // Gender is nullable in DB (legacy rows pre-00017). The new-therapist
  // form enforces `required` via HTML; the edit form shows a warning
  // banner when empty and still accepts saves without picking so admins
  // can update other fields first. Server actions coerce empty-string
  // from raw FormData to undefined before calling safeParse.
  gender: therapistGenderEnum.optional(),
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

/**
 * Parse HH:MM into a minute-of-day number so we can validate grid/duration.
 * Returns null if the string doesn't match HH:MM.
 */
function parseHmToMinutes(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

const SLOT_GRID_MINUTES = 15;
const MIN_SHIFT_MINUTES = 30;

const gridTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Must be HH:MM format")
  .refine(
    (v) => {
      const mins = parseHmToMinutes(v);
      return mins !== null && mins % SLOT_GRID_MINUTES === 0;
    },
    { message: `Time must land on a ${SLOT_GRID_MINUTES}-minute boundary (e.g. 09:00, 09:15, 09:30)` }
  );

export const availabilityRuleSchema = z
  .object({
    therapist_id: uuidFormat,
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

export type AvailabilityRuleFormData = z.infer<typeof availabilityRuleSchema>;

/**
 * Exported for the availability rule form + server action: renders an option
 * list for each 15-minute slot between start (inclusive) and end (exclusive).
 */
export function availabilityGridOptions(
  startHour = 6,
  endHour = 23
): string[] {
  const out: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += SLOT_GRID_MINUTES) {
      if (h === endHour && m > 0) break;
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
}

export { parseHmToMinutes, SLOT_GRID_MINUTES, MIN_SHIFT_MINUTES };

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
