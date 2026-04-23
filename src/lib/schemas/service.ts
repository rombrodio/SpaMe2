import { z } from "zod";

export const serviceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().default(""),
  duration_minutes: z.coerce.number().int().min(1, "Duration must be at least 1 minute"),
  buffer_minutes: z.coerce.number().int().min(0).default(0),
  // Form collects whole ILS (decimal allowed, e.g. 280 or 280.50). We persist
  // as integer agorot in the database to avoid floating-point rounding errors.
  price_ils: z
    .coerce.number()
    .min(0, "Price must be non-negative")
    .transform((v) => Math.round(v * 100)),
  is_active: z.boolean().default(true),
});

export type ServiceFormData = z.infer<typeof serviceSchema>;
