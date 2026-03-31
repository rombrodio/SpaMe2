import { z } from "zod";

export const customerSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  phone: z
    .string()
    .min(1, "Phone is required")
    .max(20)
    .regex(/^\+?[0-9\s\-()]+$/, "Invalid phone number"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  notes: z.string().max(1000).optional().default(""),
});

export type CustomerFormData = z.infer<typeof customerSchema>;
