import { z } from "zod";
import { normalizePhoneIL } from "@/lib/messaging/twilio";

/**
 * Spa-level operational settings — stored as a single row in spa_settings
 * (CHECK id = 1). Phase 4.6 added the three business-hours fields. All
 * fields are optional on the form; the phone + manager name stay nullable
 * until the admin fills them in, while the three business-hours fields
 * always have defaults (09:00 / 21:00 / 60).
 */
const TIME_HH_MM = /^(\d{2}):(\d{2})$/;

function parseHmToMinutes(value: string): number | null {
  const m = TIME_HH_MM.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export const spaSettingsSchema = z
  .object({
    on_call_manager_name: z
      .string()
      .max(100)
      .optional()
      .default(""),
    on_call_manager_phone: z
      .string()
      .optional()
      .default("")
      .refine((v) => v === "" || normalizePhoneIL(v) !== null, {
        message: "Must be a valid Israeli phone number (e.g. 0521234567)",
      }),
    business_hours_start: z
      .string()
      .regex(TIME_HH_MM, "Must be HH:MM")
      .default("09:00"),
    business_hours_end: z
      .string()
      .regex(TIME_HH_MM, "Must be HH:MM")
      .default("21:00"),
    slot_granularity_minutes: z.coerce
      .number()
      .int()
      .refine((n) => n === 15 || n === 30 || n === 60, {
        message: "Slot granularity must be 15, 30, or 60 minutes",
      })
      .default(60),
  })
  .superRefine((d, ctx) => {
    const start = parseHmToMinutes(d.business_hours_start);
    const end = parseHmToMinutes(d.business_hours_end);
    if (start === null || end === null) return; // already caught by regex
    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["business_hours_end"],
        message: "Closing time must be after opening time",
      });
    }
  });

export type SpaSettingsInput = z.infer<typeof spaSettingsSchema>;

/** Runtime-effective settings with safe defaults. Used by the slot engine. */
export interface SpaSettingsEffective {
  businessHoursStart: string; // HH:MM
  businessHoursEnd: string; // HH:MM
  slotGranularityMinutes: 15 | 30 | 60;
}

export const DEFAULT_SPA_SETTINGS: SpaSettingsEffective = {
  businessHoursStart: "09:00",
  businessHoursEnd: "21:00",
  slotGranularityMinutes: 60,
};
