import { describe, it, expect } from "vitest";
import {
  receptionistSchema,
  receptionistAvailabilityRuleSchema,
} from "../receptionist";

describe("receptionistSchema", () => {
  it("accepts a minimal valid record", () => {
    const result = receptionistSchema.safeParse({
      full_name: "Jane Doe",
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty-string email (optional)", () => {
    const result = receptionistSchema.safeParse({
      full_name: "Jane Doe",
      email: "",
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty full_name", () => {
    const result = receptionistSchema.safeParse({
      full_name: "",
      is_active: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.full_name).toBeDefined();
    }
  });

  it("rejects malformed email", () => {
    const result = receptionistSchema.safeParse({
      full_name: "Jane Doe",
      email: "not-an-email",
      is_active: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("receptionistAvailabilityRuleSchema", () => {
  const base = {
    receptionist_id: "550e8400-e29b-41d4-a716-446655440000",
    day_of_week: "monday",
    valid_from: "2026-01-01",
  };

  it("accepts a valid on-duty window on the 15-min grid", () => {
    const result = receptionistAvailabilityRuleSchema.safeParse({
      ...base,
      start_time: "09:00",
      end_time: "17:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects off-grid times (e.g. 09:07)", () => {
    const result = receptionistAvailabilityRuleSchema.safeParse({
      ...base,
      start_time: "09:07",
      end_time: "17:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects end_time <= start_time", () => {
    const result = receptionistAvailabilityRuleSchema.safeParse({
      ...base,
      start_time: "17:00",
      end_time: "09:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.flatten().fieldErrors.end_time ?? [];
      expect(issues.some((m) => /after/i.test(m))).toBe(true);
    }
  });

  it("rejects shifts shorter than 30 minutes", () => {
    const result = receptionistAvailabilityRuleSchema.safeParse({
      ...base,
      start_time: "09:00",
      end_time: "09:15",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.flatten().fieldErrors.end_time ?? [];
      expect(issues.some((m) => /30 minutes/i.test(m))).toBe(true);
    }
  });

  it("accepts an exactly-30-minute shift", () => {
    const result = receptionistAvailabilityRuleSchema.safeParse({
      ...base,
      start_time: "09:00",
      end_time: "09:30",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed HH:MM", () => {
    const result = receptionistAvailabilityRuleSchema.safeParse({
      ...base,
      start_time: "9:00",
      end_time: "17:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for receptionist_id", () => {
    const result = receptionistAvailabilityRuleSchema.safeParse({
      ...base,
      receptionist_id: "not-a-uuid",
      start_time: "09:00",
      end_time: "17:00",
    });
    expect(result.success).toBe(false);
  });
});
