import { z } from "zod";

export const serviceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().default(""),
  duration_minutes: z.coerce.number().int().min(1, "Duration must be at least 1 minute"),
  buffer_minutes: z.coerce.number().int().min(0).default(0),
  price_ils: z.coerce.number().int().min(0, "Price must be non-negative"),
  is_active: z.boolean().default(true),
});

export type ServiceFormData = z.infer<typeof serviceSchema>;
