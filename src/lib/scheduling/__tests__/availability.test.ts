import { describe, it, expect } from "vitest";
import {
  validateBookingSlot,
  findAvailableSlots,
  getTherapistWindows,
} from "../availability";
import type {
  AvailabilityRule,
  TimeOff,
  RoomBlock,
  ExistingBooking,
} from "../types";

// Helpers
function makeDate(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${time}:00`);
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
    start_at: "2025-01-01T10:00:00",
    end_at: "2025-01-01T11:00:00",
    status: "confirmed",
    ...overrides,
  };
}

// ─── getTherapistWindows ───

describe("getTherapistWindows", () => {
  it("returns windows for matching day and valid date range", () => {
    const date = new Date("2025-01-01T12:00:00"); // Wednesday
    const rules = [makeRule()];
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(1);
    expect(windows[0].start.getHours()).toBe(9);
    expect(windows[0].end.getHours()).toBe(17);
  });

  it("returns empty for non-matching day", () => {
    const date = new Date("2025-01-02T12:00:00"); // Thursday
    const rules = [makeRule()]; // rule is for Wednesday
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(0);
  });

  it("returns empty if date is before valid_from", () => {
    const date = new Date("2024-12-31T12:00:00"); // Before valid_from
    const rules = [makeRule()]; // valid_from = 2025-01-01
    // 2024-12-31 is a Tuesday, rule is for Wednesday, so it won't match anyway.
    // Let's test with a proper Wednesday
    const rule = makeRule({ day_of_week: "tuesday", valid_from: "2025-01-01" });
    const windows = getTherapistWindows(date, [rule], []);
    expect(windows).toHaveLength(0);
  });

  it("subtracts time-off periods from windows", () => {
    const date = new Date("2025-01-01T12:00:00");
    const rules = [makeRule()]; // 09:00–17:00
    const timeOffs: TimeOff[] = [
      {
        id: "off-1",
        therapist_id: "therapist-1",
        start_at: "2025-01-01T12:00:00",
        end_at: "2025-01-01T14:00:00",
      },
    ];
    const windows = getTherapistWindows(date, rules, timeOffs);
    expect(windows).toHaveLength(2);
    // First window: 09:00–12:00
    expect(windows[0].start.getHours()).toBe(9);
    expect(windows[0].end.getHours()).toBe(12);
    // Second window: 14:00–17:00
    expect(windows[1].start.getHours()).toBe(14);
    expect(windows[1].end.getHours()).toBe(17);
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
          start_at: "2025-01-01T09:00:00",
          end_at: "2025-01-01T12:00:00",
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
          start_at: "2025-01-01T09:00:00",
          end_at: "2025-01-01T12:00:00",
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
    const date = new Date("2025-01-01T12:00:00"); // Wednesday
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings: [],
    });
    expect(slots.length).toBeGreaterThan(0);
    // Slots should be within 09:00–17:00
    for (const slot of slots) {
      expect(slot.start.getHours()).toBeGreaterThanOrEqual(9);
      // With 60+15 min duration, last slot starts at 15:45
      expect(slot.start.getHours()).toBeLessThan(17);
    }
  });

  it("skips slots that overlap with existing bookings", () => {
    const date = new Date("2025-01-01T12:00:00");
    const existingBookings: ExistingBooking[] = [
      makeBooking({
        start_at: "2025-01-01T10:00:00",
        end_at: "2025-01-01T11:15:00",
      }),
    ];
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings,
    });
    // No slot should start during 10:00–11:15
    for (const slot of slots) {
      const h = slot.start.getHours();
      const m = slot.start.getMinutes();
      const totalMin = h * 60 + m;
      // Slot + buffer = 75 min, so slot at 10:00 occupies 10:00–11:15
      // Any slot starting between ~8:46 and 11:15 would overlap
      if (totalMin >= 600 && totalMin < 675) {
        // This slot shouldn't exist — the therapist/room is occupied
        throw new Error(`Unexpected slot at ${h}:${m}`);
      }
    }
  });

  it("returns empty when no availability rules match", () => {
    const date = new Date("2025-01-02T12:00:00"); // Thursday, no rules
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
    const date = new Date("2025-01-01T12:00:00");
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
    const date = new Date("2025-01-01T12:00:00");
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
    const date = new Date("2025-01-01T12:00:00");
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
    const date = new Date("2025-01-01T12:00:00");
    const blockedRoom = {
      ...room,
      blocks: [
        {
          id: "block-1",
          room_id: "room-1",
          start_at: "2025-01-01T09:00:00",
          end_at: "2025-01-01T17:00:00",
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
