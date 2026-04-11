import { z } from "zod";

const uuidFormat = z.string().uuid("Invalid UUID");

export const roomSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().default(""),
  is_active: z.boolean().default(true),
});

export type RoomFormData = z.infer<typeof roomSchema>;

export const roomBlockSchema = z
  .object({
    room_id: uuidFormat,
    start_at: z.string().min(1, "Start date/time is required"),
    end_at: z.string().min(1, "End date/time is required"),
    reason: z.string().max(500).optional().default(""),
  })
  .refine((d) => d.start_at < d.end_at, {
    message: "Start must be before end",
    path: ["end_at"],
  });

export type RoomBlockFormData = z.infer<typeof roomBlockSchema>;
