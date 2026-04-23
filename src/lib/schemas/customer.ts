import { z } from "zod";
import { normalizeIsraeliPhone, isE164 } from "@/lib/phone";

/**
 * SPA-101: normalize phone to E.164 at the schema boundary so the DB only
 * stores canonical numbers. Accepts everyday Israeli input (0501234567,
 * 05-0123-4567, +972501234567, 972501234567) and rejects anything that
 * can't be coerced.
 */
export const customerSchema = z.object({
  full_name: z
    .string()
    .min(1, "Name is required")
    .max(100)
    // Light normalization: strip leading/trailing whitespace. Display-layer
    // title-casing happens on render so we don't mutate customer-supplied
    // spellings in the DB.
    .transform((v) => v.trim()),
  phone: z
    .string()
    .min(1, "Phone is required")
    .max(20)
    .transform((v) => normalizeIsraeliPhone(v))
    .refine(isE164, {
      message:
        "Invalid phone number. Use 0501234567, 05-0123-4567, or +972501234567.",
    }),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  notes: z.string().max(1000).optional().default(""),
});

export type CustomerFormData = z.infer<typeof customerSchema>;
