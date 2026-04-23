import { describe, it, expect } from "vitest";
import {
  validateBookingSlot,
  findAvailableSlots,
  getTherapistWindows,
} from "../availability";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import type {
  AvailabilityRule,
  TimeOff,
  RoomBlock,
  ExistingBooking,
} from "../types";

// Helpers — all dates created in Jerusalem timezone for consistency
function makeDate(dateStr: string, time: string): Date {
  return fromZonedTime(`${dateStr}T${time}:00`, TZ);
}

/** Get hours in Jerusalem timezone from a UTC date. */
function getJerusalemHours(date: Date): number {
  return toZonedTime(date, TZ).getHours();
}

function makeRule(overrides: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    id: "rule-1",
    therapist_id: "therapist-1",
    day_of_week: "wednesday", // 2025-01-01 is a Wednesday
    start_time: "09:00",
    end_time: "17:00",
    valid_from: "2025-01-01",
    valid_until: null,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<ExistingBooking> = {}): ExistingBooking {
  return {
    id: "booking-1",
    therapist_id: "therapist-1",
    room_id: "room-1",
    service_id: "service-1",
    start_at: makeDate("2025-01-01", "10:00").toISOString(),
    end_at: makeDate("2025-01-01", "11:00").toISOString(),
    status: "confirmed",
    ...overrides,
  };
}

// ─── getTherapistWindows ───

describe("getTherapistWindows", () => {
  it("returns windows for matching day and valid date range", () => {
    const date = makeDate("2025-01-01", "12:00"); // Wednesday
    const rules = [makeRule()];
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(1);
    expect(getJerusalemHours(windows[0].start)).toBe(9);
    expect(getJerusalemHours(windows[0].end)).toBe(17);
  });

  it("returns empty for non-matching day", () => {
    const date = makeDate("2025-01-02", "12:00"); // Thursday
    const rules = [makeRule()]; // rule is for Wednesday
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(0);
  });

  it("returns empty if date is before valid_from", () => {
    // 2024-12-31 is a Tuesday
    const date = makeDate("2024-12-31", "12:00");
    const rule = makeRule({ day_of_week: "tuesday", valid_from: "2025-01-01" });
    const windows = getTherapistWindows(date, [rule], []);
    expect(windows).toHaveLength(0);
  });

  it("subtracts time-off periods from windows", () => {
    const date = makeDate("2025-01-01", "12:00");
    const rules = [makeRule()]; // 09:00–17:00
    const timeOffs: TimeOff[] = [
      {
        id: "off-1",
        therapist_id: "therapist-1",
        start_at: makeDate("2025-01-01", "12:00").toISOString(),
        end_at: makeDate("2025-01-01", "14:00").toISOString(),
      },
    ];
    const windows = getTherapistWindows(date, rules, timeOffs);
    expect(windows).toHaveLength(2);
    // First window: 09:00–12:00
    expect(getJerusalemHours(windows[0].start)).toBe(9);
    expect(getJerusalemHours(windows[0].end)).toBe(12);
    // Second window: 14:00–17:00
    expect(getJerusalemHours(windows[1].start)).toBe(14);
    expect(getJerusalemHours(windows[1].end)).toBe(17);
  });

  it("merges overlapping availability rules", () => {
    const date = makeDate("2025-01-01", "12:00");
    const rules = [
      makeRule({ id: "r1", start_time: "09:00", end_time: "13:00" }),
      makeRule({ id: "r2", start_time: "11:00", end_time: "17:00" }),
    ];
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(1);
    expect(getJerusalemHours(windows[0].start)).toBe(9);
    expect(getJerusalemHours(windows[0].end)).toBe(17);
  });

  it("merges adjacent availability rules", () => {
    const date = makeDate("2025-01-01", "12:00");
    const rules = [
      makeRule({ id: "r1", start_time: "09:00", end_time: "13:00" }),
      makeRule({ id: "r2", start_time: "13:00", end_time: "17:00" }),
    ];
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(1);
    expect(getJerusalemHours(windows[0].start)).toBe(9);
    expect(getJerusalemHours(windows[0].end)).toBe(17);
  });
});

// ─── validateBookingSlot ───

describe("validateBookingSlot", () => {
  const baseParams = {
    therapistId: "therapist-1",
    roomId: "room-1",
    serviceId: "service-1",
    start: makeDate("2025-01-01", "10:00"),
    end: makeDate("2025-01-01", "11:00"),
    availabilityRules: [makeRule()],
    timeOffs: [] as TimeOff[],
    roomBlocks: [] as RoomBlock[],
    existingBookings: [] as ExistingBooking[],
    therapistServiceIds: ["service-1"],
    roomServiceIds: ["service-1"],
  };

  it("returns no conflicts for a valid booking", () => {
    const conflicts = validateBookingSlot(baseParams);
    expect(conflicts).toHaveLength(0);
  });

  it("detects therapist not qualified for service", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      therapistServiceIds: ["service-other"],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("therapist_not_qualified");
  });

  it("detects room not compatible with service", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      roomServiceIds: ["service-other"],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("room_not_compatible");
  });

  it("detects therapist unavailable (outside availability window)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "07:00"),
      end: makeDate("2025-01-01", "08:00"),
    });
    const unavailable = conflicts.find(
      (c) => c.type === "therapist_unavailable"
    );
    expect(unavailable).toBeDefined();
  });

  it("detects therapist time off", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      timeOffs: [
        {
          id: "off-1",
          therapist_id: "therapist-1",
          start_at: makeDate("2025-01-01", "09:00").toISOString(),
          end_at: makeDate("2025-01-01", "12:00").toISOString(),
        },
      ],
    });
    const timeOff = conflicts.find((c) => c.type === "therapist_time_off");
    expect(timeOff).toBeDefined();
  });

  it("detects room blocked", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      roomBlocks: [
        {
          id: "block-1",
          room_id: "room-1",
          start_at: makeDate("2025-01-01", "09:00").toISOString(),
          end_at: makeDate("2025-01-01", "12:00").toISOString(),
        },
      ],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("room_blocked");
  });

  // ─── Double-booking prevention ───

  it("detects therapist double-booking (exact overlap)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      existingBookings: [makeBooking()],
    });
    const overlap = conflicts.find((c) => c.type === "therapist_overlap");
    expect(overlap).toBeDefined();
  });

  it("detects therapist double-booking (partial overlap - start inside existing)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "10:30"),
      end: makeDate("2025-01-01", "11:30"),
      existingBookings: [makeBooking()], // 10:00–11:00
    });
    const overlap = conflicts.find((c) => c.type === "therapist_overlap");
    expect(overlap).toBeDefined();
  });

  it("detects therapist double-booking (new booking contains existing)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "09:30"),
      end: makeDate("2025-01-01", "11:30"),
      existingBookings: [makeBooking()], // 10:00–11:00
    });
    const overlap = conflicts.find((c) => c.type === "therapist_overlap");
    expect(overlap).toBeDefined();
  });

  it("allows adjacent bookings (no overlap)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "11:00"),
      end: makeDate("2025-01-01", "12:00"),
      existingBookings: [makeBooking()], // 10:00–11:00
    });
    const overlap = conflicts.find((c) => c.type === "therapist_overlap");
    expect(overlap).toBeUndefined();
  });

  it("detects room double-booking", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      existingBookings: [
        makeBooking({ therapist_id: "therapist-other" }), // different therapist, same room
      ],
    });
    const overlap = conflicts.find((c) => c.type === "room_overlap");
    expect(overlap).toBeDefined();
  });

  it("ignores cancelled bookings for overlap checks", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      existingBookings: [makeBooking({ status: "cancelled" })],
    });
    const overlap = conflicts.find(
      (c) => c.type === "therapist_overlap" || c.type === "room_overlap"
    );
    expect(overlap).toBeUndefined();
  });

  it("excludes specified booking from overlap checks (for reschedule)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      existingBookings: [makeBooking()],
      excludeBookingId: "booking-1",
    });
    const overlap = conflicts.find(
      (c) => c.type === "therapist_overlap" || c.type === "room_overlap"
    );
    expect(overlap).toBeUndefined();
  });

  it("detects multiple conflicts at once", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      therapistServiceIds: ["service-other"],
      roomServiceIds: ["service-other"],
      start: makeDate("2025-01-01", "07:00"),
      end: makeDate("2025-01-01", "08:00"),
    });
    // Should report: therapist_not_qualified, room_not_compatible, therapist_unavailable
    expect(conflicts.length).toBeGreaterThanOrEqual(3);
  });

  it("allows booking spanning merged overlapping windows", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "09:00"),
      end: makeDate("2025-01-01", "15:00"),
      availabilityRules: [
        makeRule({ id: "r1", start_time: "09:00", end_time: "13:00" }),
        makeRule({ id: "r2", start_time: "11:00", end_time: "17:00" }),
      ],
    });
    const unavailable = conflicts.find(
      (c) => c.type === "therapist_unavailable"
    );
    expect(unavailable).toBeUndefined();
  });
});

// ─── findAvailableSlots ───

describe("findAvailableSlots", () => {
  const service = {
    id: "service-1",
    name: "Massage",
    duration_minutes: 60,
    buffer_minutes: 15,
    price_ils: 30000,
  };

  const therapist = {
    id: "therapist-1",
    full_name: "Alice",
    color: "#ff0000",
    availabilityRules: [makeRule()],
    timeOffs: [] as TimeOff[],
    serviceIds: ["service-1"],
  };

  const room = {
    id: "room-1",
    name: "Room A",
    serviceIds: ["service-1"],
    blocks: [] as RoomBlock[],
  };

  it("returns slots for a day with availability", () => {
    const date = makeDate("2025-01-01", "12:00"); // Wednesday
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings: [],
    });
    expect(slots.length).toBeGreaterThan(0);
    // Slots should be within 09:00–17:00 Jerusalem time
    for (const slot of slots) {
      const h = getJerusalemHours(slot.start);
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThan(17);
    }
  });

  it("minStart hides past + near-future slots", () => {
    // The availability rule window is 09:00–17:00 Jerusalem time.
    // Setting minStart to 13:00 should hide every 09:00–12:45 grid
    // slot and leave the 13:00+ slots intact.
    const date = makeDate("2025-01-01", "12:00");
    const minStart = makeDate("2025-01-01", "13:00");
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings: [],
      minStart,
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.start.getTime()).toBeGreaterThanOrEqual(
        minStart.getTime()
      );
    }
    // Sanity: without minStart we would have gotten slots starting
    // at 09:00. With the filter, none do.
    const earliest = slots.reduce(
      (min, s) => (s.start < min ? s.start : min),
      slots[0].start
    );
    expect(getJerusalemHours(earliest)).toBeGreaterThanOrEqual(13);
  });

  it("minStart of a day's end returns zero slots", () => {
    const date = makeDate("2025-01-01", "12:00");
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings: [],
      minStart: makeDate("2025-01-01", "23:59"),
    });
    expect(slots).toHaveLength(0);
  });

  it("skips slots that overlap with existing bookings", () => {
    const date = makeDate("2025-01-01", "12:00");
    const existingBookings: ExistingBooking[] = [
      makeBooking({
        start_at: makeDate("2025-01-01", "10:00").toISOString(),
        end_at: makeDate("2025-01-01", "11:15").toISOString(),
      }),
    ];
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings,
    });
    // No slot should overlap with the 10:00–11:15 booking
    for (const slot of slots) {
      const zoned = toZonedTime(slot.start, TZ);
      const totalMin = zoned.getHours() * 60 + zoned.getMinutes();
      // Slot at 10:00 would occupy 10:00–11:15, overlapping the existing booking
      if (totalMin >= 600 && totalMin < 675) {
        throw new Error(`Unexpected slot at ${zoned.getHours()}:${zoned.getMinutes()}`);
      }
    }
  });

  it("returns empty when no availability rules match", () => {
    const date = makeDate("2025-01-02", "12:00"); // Thursday, no rules
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings: [],
    });
    expect(slots).toHaveLength(0);
  });

  it("returns empty when no therapist is qualified", () => {
    const date = makeDate("2025-01-01", "12:00");
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [{ ...therapist, serviceIds: ["other-service"] }],
      rooms: [room],
      existingBookings: [],
    });
    expect(slots).toHaveLength(0);
  });

  it("returns empty when no room is compatible", () => {
    const date = makeDate("2025-01-01", "12:00");
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [{ ...room, serviceIds: ["other-service"] }],
      existingBookings: [],
    });
    expect(slots).toHaveLength(0);
  });

  it("filters by specific therapist when requested", () => {
    const date = makeDate("2025-01-01", "12:00");
    const therapist2 = {
      ...therapist,
      id: "therapist-2",
      full_name: "Bob",
      availabilityRules: [makeRule({ therapist_id: "therapist-2" })],
    };
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist, therapist2],
      rooms: [room],
      existingBookings: [],
      filterTherapistId: "therapist-2",
    });
    for (const slot of slots) {
      expect(slot.therapist_id).toBe("therapist-2");
    }
  });

  it("skips blocked rooms", () => {
    const date = makeDate("2025-01-01", "12:00");
    const blockedRoom = {
      ...room,
      blocks: [
        {
          id: "block-1",
          room_id: "room-1",
          start_at: makeDate("2025-01-01", "09:00").toISOString(),
          end_at: makeDate("2025-01-01", "17:00").toISOString(),
        },
      ],
    };
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [blockedRoom],
      existingBookings: [],
    });
    expect(slots).toHaveLength(0);
  });
});

// ─── Zod schema validation ───

describe("booking schema validation", () => {
  // Use crypto.randomUUID() for valid v4 UUIDs
  const uuid1 = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
  const uuid2 = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
  const uuid3 = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";
  const uuid4 = "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a";

  it("rejects invalid datetime format for start_at", async () => {
    const { createBookingSchema } = await import("@/lib/schemas/booking");
    const result = createBookingSchema.safeParse({
      customer_id: uuid1,
      therapist_id: uuid2,
      room_id: uuid3,
      service_id: uuid4,
      start_at: "banana",
      status: "confirmed",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid datetime format for start_at", async () => {
    const { createBookingSchema } = await import("@/lib/schemas/booking");
    const result = createBookingSchema.safeParse({
      customer_id: uuid1,
      therapist_id: uuid2,
      room_id: uuid3,
      service_id: uuid4,
      start_at: "2025-01-01T10:00",
      status: "confirmed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status in updateBookingStatusSchema", async () => {
    const { updateBookingStatusSchema } = await import("@/lib/schemas/booking");
    const result = updateBookingStatusSchema.safeParse({
      booking_id: uuid1,
      new_status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });
});
