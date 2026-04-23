import { z } from "zod";
import { normalizePhoneIL } from "@/lib/messaging/twilio";

/**
 * Spa-level operational settings. The only V1 field is the on-call
 * manager name + phone used by the notification dispatcher (see
 * src/lib/messaging/on-call-manager.ts).
 *
 * Both fields are optional: when the phone is NULL the dispatcher
 * logs a warning and silently skips, so the app still works even
 * before the admin has filled this in.
 */
export const spaSettingsSchema = z.object({
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
});

export type SpaSettingsInput = z.infer<typeof spaSettingsSchema>;
